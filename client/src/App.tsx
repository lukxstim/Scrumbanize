import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useMatch, useNavigate, useParams, useSearchParams } from 'react-router';
import BoardPage from './components/board/BoardPage';
import CommandPalette from './components/CommandPalette';
import MobileNav from './components/MobileNav';
import ActivityDrawer from './components/activity/ActivityDrawer';
import UserMenu from './components/auth/UserMenu';
import CalendarPage from './components/calendar/CalendarPage';
import TrashPage from './components/trash/TrashPage';
import { BoardIcon, CalendarIcon, ChartIcon, HistoryIcon, SettingsIcon, NoteIcon, SearchIcon, TrashIcon } from './components/icons';
import NotesPage from './components/notes/NotesPage';
import AllNotesPage from './components/knowledge/AllNotesPage';
import KnowledgeLayout from './components/knowledge/KnowledgeLayout';
import NewProjectHost from './components/projects/NewProjectHost';
import ProjectLayout from './components/projects/ProjectLayout';
import ProjectSwitcher from './components/projects/ProjectSwitcher';
import RedirectToProject from './components/projects/RedirectToProject';
import Tour from './components/onboarding/Tour';
import PresenceAvatars from './components/PresenceAvatars';
import ThemeSwitcher from './components/ThemeSwitcher';
import Kbd, { modKey } from './components/ui/Kbd';
import { useProjectPresence } from './hooks/useCollaboration';
import { useIsMobile } from './hooks/useMediaQuery';
import { desktopBridge } from './hooks/useDesktopSettings';
import { useRealtimeStatus } from './hooks/useRealtime';
import { useProjects } from './hooks/useProjects';
import { useStoredState } from './hooks/useStoredState';
import { useRestoreNotice } from './hooks/useRestoreNotice';
import { useToast } from './hooks/useToast';
import { useTrashCount } from './hooks/useTrash';
import { onTourStartRequest } from './utils/appEvents';
import { closedTourState, INITIAL_TOUR_STATE, isTourState, TOUR_STORAGE_KEY } from './utils/tour';
import { isReminderState, REMINDER_STORAGE_KEY, reminderStep, type ReminderState } from './utils/updateReminder';
import { ACTIVITY_PARAM, KNOWLEDGE_PATH, paths, withActivityDrawer } from './utils/paths';
import { hasBoard } from './utils/projects';

// Loaded on first visit, so the charting library stays out of the main bundle.
const AnalyticsPage = lazy(() => import('./components/analytics/AnalyticsPage'));
const GraphPage = lazy(() => import('./components/graph/GraphPage'));
const SettingsPage = lazy(() => import('./components/settings/SettingsPage'));
const ProfilePage = lazy(() => import('./components/account/ProfilePage'));
const UsersPage = lazy(() => import('./components/account/UsersPage'));


/** Round icon buttons at the right of the header (activity, trash). */
const headerIconClass = (active: boolean) =>
  `relative grid size-8 shrink-0 place-items-center rounded-md transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-accent ${
    active ? 'bg-surface-strong text-fg' : 'text-fg-subtle hover:bg-surface-hover hover:text-fg'
  }`;

/** Old address of the activity page: the project's notes with the activity drawer open. */
function ActivityRedirect() {
  return <Navigate to={withActivityDrawer(paths.notes(Number(useParams().projectId)))} replace />;
}

/**
 * A tab's name: visible from xl (1280 px) on; narrower, only for screen readers, and the tab shows its icon and a
 * tooltip. With names, the header needs about 1160 px.
 */
function TabLabel({ children }: { children: string }) {
  return <span className="sr-only xl:not-sr-only">{children}</span>;
}

const tabClass = (active: boolean) =>
  `flex h-7 items-center gap-1.5 rounded-md px-2 text-sm font-medium xl:px-2.5 transition-[color,background-color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-accent ${
    active ? 'bg-surface text-fg shadow-card' : 'text-fg-subtle hover:text-fg'
  }`;

export default function App() {
  const { projects, desktop } = useProjects();
  const toast = useToast();
  const projectMatch = useMatch('/p/:projectId/*');
  const activeProject = projects.find((p) => p.id === Number(projectMatch?.params.projectId));
  // One area for all notebooks (US-26); those with their board switched on also have board, calendar and statistics.
  const withBoard = activeProject !== undefined && hasBoard(activeProject);
  const onAllNotes = useMatch(`${KNOWLEDGE_PATH}/*`) !== null;
  // A task's details are shown on the board, so the Board tab stays active there.
  const boardMatch = useMatch('/p/:projectId/board');
  const taskMatch = useMatch('/p/:projectId/tasks/:taskId');
  const onBoard = boardMatch !== null || taskMatch !== null;
  const onCalendar = useMatch('/p/:projectId/calendar') !== null;
  const onAnalytics = useMatch('/p/:projectId/analytics') !== null;
  // The graph is a view of the notes area, so the Notes tab stays active there.
  const onGraph = useMatch('/p/:projectId/graph') !== null;
  const onTrash = useMatch('/p/:projectId/trash') !== null;
  const onSettings = useMatch('/p/:projectId/settings') !== null;
  const section = onSettings ? 'settings' : onTrash ? 'trash' : onAnalytics ? 'analytics' : onCalendar ? 'calendar' : onBoard ? 'board' : onGraph ? 'graph' : 'notes';
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activityOpen = searchParams.get(ACTIVITY_PARAM) === '1' && activeProject !== undefined;

  function closeActivity() {
    const params = new URLSearchParams(location.search);
    params.delete(ACTIVITY_PARAM);
    const search = params.toString();
    navigate(`${location.pathname}${search ? `?${search}` : ''}`, { replace: true });
  }
  const trashCount = useTrashCount(activeProject?.id);
  // Who else is in this project right now, and whether live updates arrive (US-24).
  const others = useProjectPresence(activeProject?.id);
  const offline = useRealtimeStatus() === 'reconnecting';
  useRestoreNotice();
  const [paletteOpen, setPaletteOpen] = useState(false);

  // The onboarding tour starts by itself once the first project is shown, unless it was dismissed for good
  // ("Nicht erneut anzeigen"); the command palette can start it again.
  const [tourState, setTourState] = useStoredState(TOUR_STORAGE_KEY, INITIAL_TOUR_STATE, isTourState);
  const [tourOpen, setTourOpen] = useState(false);
  const tourOffered = useRef(false);
  // In a notebook with board: the tour shows the board and its tabs.
  const hasProject = withBoard;
  // It points at the header of wide screens, so phones (US-25) never get it.
  const mobile = useIsMobile();
  useEffect(() => {
    if (!hasProject || mobile || tourOffered.current || tourState.status === 'done') return;
    tourOffered.current = true;
    // A moment after the page appeared, so the tour points at a settled header.
    const timer = setTimeout(() => setTourOpen(true), 700);
    return () => clearTimeout(timer);
  }, [hasProject, mobile, tourState.status]);
  useEffect(() => onTourStartRequest(() => setTourOpen(true)), []);

  // Desktop app only: every few weeks a reminder to look for a new version (it cannot check by itself, the
  // releases are private). Never while the tour is open, and at most once per start.
  const [reminder, setReminder] = useStoredState<ReminderState | null>(REMINDER_STORAGE_KEY, null, isReminderState);
  const reminderChecked = useRef(false);
  const tourOpenRef = useRef(tourOpen);
  const reminderTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    tourOpenRef.current = tourOpen;
  });
  // Scheduling the next reminder re-runs the effect below, so its timer is only cleared when the app goes away.
  useEffect(() => () => clearTimeout(reminderTimer.current), []);
  useEffect(() => {
    if (!desktop || reminderChecked.current) return;
    reminderChecked.current = true;
    const { remind, next } = reminderStep(reminder, new Date());
    if (next) setReminder(next);
    if (!remind) return;
    // A little later, so a tour that starts by itself (after 0.7 s) comes first and the reminder stays away.
    reminderTimer.current = setTimeout(() => {
      if (tourOpenRef.current) return;
      toast({
        message: `Zeit für ein Update? Du nutzt Version ${desktop.version}.`,
        tone: 'info',
        duration: 20_000,
        action: { label: 'Nachsehen', onClick: () => void window.open(desktop.releasesUrl, '_blank', 'noopener') },
      });
    }, 3000);
  }, [desktop, reminder, setReminder, toast]);

  // Desktop app only: a click on a reminder notification opens its task (or the calendar).
  useEffect(() => desktopBridge?.onNavigate((path) => navigate(path)), [navigate]);

  // ⌘K / Ctrl+K opens the command palette from anywhere, also while typing.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        // Render (and focus the input) right away, so the next typed key already goes into the palette.
        flushSync(() => setPaletteOpen((open) => !open));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    // dvh: on tablets the browser's address bar must not push the bottom of the page out of view.
    <div className="flex h-dvh flex-col bg-canvas text-fg">
      {/*
        The header gets compact in steps, so it never overflows: below xl (1280 px) the tabs show only icons and the
        wordmark goes, below lg (1024 px, the desktop app's minimum width) the search is an icon. Below md (768 px,
        phones, US-25) it keeps logo, notebook, search and account; the tabs and the tools move to the bottom
        navigation (MobileNav). The top padding keeps it clear of the notch of an installed app.
      */}
      <header className="relative z-20 flex h-[calc(3.25rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 border-b border-line bg-surface/80 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:gap-3 lg:px-4">
        {/* The logo leads back to the last project used, e.g. from the profile or the user management. */}
        <Link
          to="/"
          title="Zur Startseite"
          className="flex shrink-0 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-accent"
        >
          {/* The logo tile (public/scrumbanize-logo.png, from docs/branding); the wordmark is plain text, so it stays sharp. */}
          <img src="/scrumbanize-logo.png" alt="" width={28} height={28} className="size-7 rounded-md shadow-sm" />
          <span className="sr-only text-sm font-semibold tracking-tight xl:not-sr-only">Scrumbanize</span>
        </Link>
        {/* The notebook shown (US-26: one area for all), its notes and – with board – board, calendar and statistics. */}
        {activeProject && (
          <>
            <span className="h-5 w-px shrink-0 bg-line max-md:hidden" aria-hidden="true" />
            <ProjectSwitcher active={activeProject} section={section} />
            <nav
              className="inline-flex shrink-0 rounded-lg bg-surface-muted p-0.5 ring-1 ring-line ring-inset max-md:hidden lg:ml-2"
              aria-label="Hauptnavigation"
            >
              <NavLink to={paths.notes(activeProject.id)} className={({ isActive }) => tabClass(isActive || onGraph)} data-tour="tab-notes" title="Notizen">
                <NoteIcon className="size-3.5" />
                <TabLabel>Notizen</TabLabel>
              </NavLink>
              {withBoard && (
                <>
                  <NavLink to={paths.board(activeProject.id)} className={() => tabClass(onBoard)} data-tour="tab-board" title="Board">
                    <BoardIcon className="size-3.5" />
                    <TabLabel>Board</TabLabel>
                  </NavLink>
                  <NavLink to={paths.calendar(activeProject.id)} className={({ isActive }) => tabClass(isActive)} data-tour="tab-calendar" title="Kalender">
                    <CalendarIcon className="size-3.5" />
                    <TabLabel>Kalender</TabLabel>
                  </NavLink>
                  <NavLink to={paths.analytics(activeProject.id)} className={({ isActive }) => tabClass(isActive)} data-tour="tab-analytics" title="Statistiken">
                    <ChartIcon className="size-3.5" />
                    <TabLabel>Statistiken</TabLabel>
                  </NavLink>
                </>
              )}
            </nav>
          </>
        )}
        <div className="flex-1" />
        {offline && (
          <span
            role="status"
            title="Änderungen anderer erscheinen wieder, sobald die Verbindung zurück ist."
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-warning-muted px-2.5 py-1 text-xs font-medium text-warning-text"
          >
            <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-current" />
            <span className="sr-only lg:not-sr-only">Verbindung wird wiederhergestellt …</span>
          </span>
        )}
        <PresenceAvatars people={others} what="gerade in diesem Projekt" max={4} className="max-md:hidden" />
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          data-tour="search"
          title={`Suchen (${modKey}+K)`}
          className="flex h-8 w-8 shrink-0 items-center justify-center gap-2 rounded-md border border-line bg-surface-muted text-sm text-fg-subtle transition-colors hover:border-line-strong hover:text-fg-muted focus-visible:outline-2 focus-visible:outline-accent lg:w-36 lg:justify-start lg:px-2.5 xl:w-44 2xl:w-60"
        >
          <SearchIcon className="size-4 shrink-0" />
          <span className="sr-only truncate lg:not-sr-only">Suchen …</span>
          <span className="ml-auto hidden gap-0.5 xl:flex">
            <Kbd>{modKey}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
        <div className="contents max-md:hidden">
          <ThemeSwitcher />
        </div>
        {activeProject && (
          <div className="flex shrink-0 items-center gap-1 max-md:hidden" data-tour="header-tools">
            <Link
              to={paths.trash(activeProject.id)}
              className={headerIconClass(onTrash)}
              aria-current={onTrash ? 'page' : undefined}
              aria-label={`Papierkorb${trashCount > 0 ? `, ${trashCount} ${trashCount === 1 ? 'Eintrag' : 'Einträge'}` : ''}`}
              title="Papierkorb"
            >
              <TrashIcon />
              {trashCount > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 font-semibold text-accent-fg tabular-nums"
                >
                  {trashCount > 99 ? '99+' : trashCount}
                </span>
              )}
            </Link>
            <Link
              to={paths.settings(activeProject.id)}
              className={headerIconClass(onSettings)}
              aria-current={onSettings ? 'page' : undefined}
              aria-label="Einstellungen"
              title="Einstellungen: Backup, Import, Export"
            >
              <SettingsIcon />
            </Link>
            <Link
              to={withActivityDrawer(location.pathname, location.search)}
              className={headerIconClass(activityOpen)}
              aria-label="Aktivität"
              title="Aktivität"
            >
              <HistoryIcon />
            </Link>
          </div>
        )}
        <UserMenu />
      </header>

      <Routes>
        <Route path="/p/:projectId" element={<ProjectLayout />}>
          <Route index element={<Navigate to="notes" replace />} />
          <Route path="notes/:noteId?" element={<NotesPage />} />
          {/* One BoardPage instance for both paths, so opening a task does not reload the board. */}
          <Route element={<BoardPage />}>
            <Route path="board" element={null} />
            <Route path="tasks/:taskId" element={null} />
          </Route>
          <Route
            path="graph"
            element={
              <Suspense fallback={null}>
                <GraphPage />
              </Suspense>
            }
          />
          <Route path="calendar" element={<CalendarPage />} />
          <Route
            path="analytics"
            element={
              <Suspense fallback={null}>
                <AnalyticsPage />
              </Suspense>
            }
          />
          <Route path="activity" element={<ActivityRedirect />} />
          <Route path="trash" element={<TrashPage />} />
          <Route
            path="settings"
            element={
              <Suspense fallback={null}>
                <SettingsPage />
              </Suspense>
            }
          />
        </Route>
        {/* "Alle Notizen" (US-22, US-26) beside the sidebar of notebooks and tags; a notebook lives under /p/:id. */}
        <Route
          path={`${KNOWLEDGE_PATH}/notizen?/:noteId?`}
          element={
            <KnowledgeLayout>
              <AllNotesPage />
            </KnowledgeLayout>
          }
        />
        {/* The own account and user management (US-21c), outside the projects. */}
        <Route
          path="/profil"
          element={
            <Suspense fallback={null}>
              <ProfilePage />
            </Suspense>
          }
        />
        <Route
          path="/benutzer"
          element={
            <Suspense fallback={null}>
              <UsersPage />
            </Suspense>
          }
        />
        {/* Addresses from before projects existed, and anything unknown, open the last project. */}
        <Route path="/board" element={<RedirectToProject section="board" />} />
        <Route path="*" element={<RedirectToProject />} />
      </Routes>

      {activityOpen && activeProject && (
        <ActivityDrawer key={activeProject.id} projectId={activeProject.id} projectName={activeProject.name} onClose={closeActivity} />
      )}

      {/* The tour points at the tabs of a board, so it waits while a notebook without one is shown. */}
      {tourOpen && !paletteOpen && withBoard && !mobile && (
        <Tour
          onClose={(dontShowAgain) => {
            setTourOpen(false);
            setTourState(closedTourState(dontShowAgain));
          }}
        />
      )}

      <MobileNav
        activeProject={activeProject}
        section={section}
        onAllNotes={onAllNotes}
        trashCount={trashCount}
        pathname={location.pathname}
        search={location.search}
      />

      <NewProjectHost />

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} activeProject={activeProject} />
    </div>
  );
}

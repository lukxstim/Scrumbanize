import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useMatch, useNavigate, useParams, useSearchParams } from 'react-router';
import BoardPage from './components/board/BoardPage';
import CommandPalette from './components/CommandPalette';
import ActivityDrawer from './components/activity/ActivityDrawer';
import CalendarPage from './components/calendar/CalendarPage';
import TrashPage from './components/trash/TrashPage';
import { BoardIcon, CalendarIcon, HistoryIcon, NoteIcon, SearchIcon, TrashIcon } from './components/icons';
import NotesPage from './components/notes/NotesPage';
import ProjectLayout from './components/projects/ProjectLayout';
import ProjectSwitcher from './components/projects/ProjectSwitcher';
import RedirectToProject from './components/projects/RedirectToProject';
import ThemeSwitcher from './components/ThemeSwitcher';
import Kbd, { modKey } from './components/ui/Kbd';
import { useProjects } from './hooks/useProjects';
import { useTrashCount } from './hooks/useTrash';
import { ACTIVITY_PARAM, paths, withActivityDrawer } from './utils/paths';


/** Round icon buttons at the right of the header (activity, trash). */
const headerIconClass = (active: boolean) =>
  `relative grid size-8 shrink-0 place-items-center rounded-md transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-accent ${
    active ? 'bg-surface-strong text-fg' : 'text-fg-subtle hover:bg-surface-hover hover:text-fg'
  }`;

/** Old address of the activity page: the project's notes with the activity drawer open. */
function ActivityRedirect() {
  return <Navigate to={withActivityDrawer(paths.notes(Number(useParams().projectId)))} replace />;
}

const tabClass = (active: boolean) =>
  `flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-[color,background-color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-accent ${
    active ? 'bg-surface text-fg shadow-card' : 'text-fg-subtle hover:text-fg'
  }`;

export default function App() {
  const { projects } = useProjects();
  const projectMatch = useMatch('/p/:projectId/*');
  const activeProject = projects.find((p) => p.id === Number(projectMatch?.params.projectId));
  // A task's details are shown on the board, so the Board tab stays active there.
  const boardMatch = useMatch('/p/:projectId/board');
  const taskMatch = useMatch('/p/:projectId/tasks/:taskId');
  const onBoard = boardMatch !== null || taskMatch !== null;
  const onCalendar = useMatch('/p/:projectId/calendar') !== null;
  const onTrash = useMatch('/p/:projectId/trash') !== null;
  const section = onTrash ? 'trash' : onCalendar ? 'calendar' : onBoard ? 'board' : 'notes';
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
  const [paletteOpen, setPaletteOpen] = useState(false);

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
    <div className="flex h-screen flex-col bg-canvas text-fg">
      <header className="relative z-20 flex h-13 shrink-0 items-center gap-3 border-b border-line bg-surface/80 px-4 backdrop-blur-md">
        <span className="flex items-center gap-2">
          {/* The emblem of public/scrumbanize.svg; the wordmark next to it is plain text, so it stays sharp. */}
          <img
            src="/scrumbanize-icon.svg"
            alt=""
            width={28}
            height={28}
            className="size-7 rounded-lg shadow-sm ring-1 ring-black/5 dark:ring-white/10"
          />
          <span className="text-sm font-semibold tracking-tight">Scrumbanize</span>
        </span>
        {activeProject && (
          <>
            <span className="text-fg-faint" aria-hidden="true">
              /
            </span>
            <ProjectSwitcher active={activeProject} section={section} />
            <nav
              className="ml-2 inline-flex rounded-lg bg-surface-muted p-0.5 ring-1 ring-line ring-inset"
              aria-label="Hauptnavigation"
            >
              <NavLink to={paths.notes(activeProject.id)} className={({ isActive }) => tabClass(isActive)}>
                <NoteIcon className="size-3.5" />
                Notizen
              </NavLink>
              <NavLink to={paths.board(activeProject.id)} className={() => tabClass(onBoard)}>
                <BoardIcon className="size-3.5" />
                Board
              </NavLink>
              <NavLink to={paths.calendar(activeProject.id)} className={({ isActive }) => tabClass(isActive)}>
                <CalendarIcon className="size-3.5" />
                Kalender
              </NavLink>
            </nav>
          </>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="flex h-8 w-60 items-center gap-2 rounded-md border border-line bg-surface-muted px-2.5 text-sm text-fg-subtle transition-colors hover:border-line-strong hover:text-fg-muted focus-visible:outline-2 focus-visible:outline-accent"
        >
          <SearchIcon className="size-4" />
          <span>Suchen …</span>
          <span className="ml-auto flex gap-0.5">
            <Kbd>{modKey}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
        <ThemeSwitcher />
        {activeProject && (
          <div className="flex items-center gap-1">
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
              to={withActivityDrawer(location.pathname, location.search)}
              className={headerIconClass(activityOpen)}
              aria-label="Aktivität"
              title="Aktivität"
            >
              <HistoryIcon />
            </Link>
          </div>
        )}
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
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="activity" element={<ActivityRedirect />} />
          <Route path="trash" element={<TrashPage />} />
        </Route>
        {/* Addresses from before projects existed, and anything unknown, open the last project. */}
        <Route path="/board" element={<RedirectToProject section="board" />} />
        <Route path="*" element={<RedirectToProject />} />
      </Routes>

      {activityOpen && activeProject && (
        <ActivityDrawer key={activeProject.id} projectId={activeProject.id} projectName={activeProject.name} onClose={closeActivity} />
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} activeProject={activeProject} />
    </div>
  );
}

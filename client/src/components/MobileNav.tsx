import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useProjects } from '../hooks/useProjects';
import type { Project } from '../types/project';
import { paths, withActivityDrawer, type Section } from '../utils/paths';
import { defaultProject, hasBoard } from '../utils/projects';
import { BoardIcon, CalendarIcon, ChartIcon, HistoryIcon, MoreIcon, NoteIcon, SettingsIcon, TrashIcon } from './icons';
import ThemeSwitcher from './ThemeSwitcher';
import Dialog from './ui/Dialog';

interface MobileNavProps {
  /** The notebook shown now, if any. */
  activeProject: Project | undefined;
  section: Section;
  /** "Alle Notizen" is shown. */
  onAllNotes: boolean;
  trashCount: number;
  /** The current address, for the activity drawer over it. */
  pathname: string;
  search: string;
}

const tabClass = (active: boolean) =>
  `flex min-h-13 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
    active ? 'text-accent-text' : 'text-fg-subtle'
  }`;

/**
 * The bottom navigation of phones (US-25), below md where the header has no room for the tabs: Notizen of the notebook
 * (its bar above the list opens all notebooks, US-26), Board and Kalender, and "Mehr" for statistics, trash, settings,
 * activity and the color scheme. Board and Kalender lead to the last notebook with a board when this one has none.
 */
export default function MobileNav({ activeProject, section, onAllNotes, trashCount, pathname, search }: MobileNavProps) {
  const { projects, sampleProjectId } = useProjects();
  const [moreOpen, setMoreOpen] = useState(false);
  const withBoard = activeProject !== undefined && hasBoard(activeProject);
  const notebook = activeProject ?? defaultProject(projects, sampleProjectId);
  const boardProject = withBoard ? activeProject : defaultProject(projects, sampleProjectId, true);
  const on = (...sections: Section[]) => activeProject !== undefined && sections.includes(section);

  const tab = (to: string | undefined, active: boolean, icon: ReactNode, label: string) =>
    to ? (
      <Link to={to} aria-current={active ? 'page' : undefined} className={tabClass(active)}>
        {icon}
        {label}
      </Link>
    ) : (
      // Without any project there is nothing to show yet.
      <span aria-disabled="true" className={`${tabClass(false)} opacity-40`}>
        {icon}
        {label}
      </span>
    );

  return (
    <>
      <nav
        aria-label="Hauptnavigation"
        className="flex shrink-0 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        {tab(notebook && paths.notes(notebook.id), onAllNotes || on('notes', 'graph'), <NoteIcon className="size-5" />, 'Notizen')}
        {tab(boardProject && paths.board(boardProject.id), withBoard && on('board'), <BoardIcon className="size-5" />, 'Board')}
        {tab(boardProject && paths.calendar(boardProject.id), withBoard && on('calendar'), <CalendarIcon className="size-5" />, 'Kalender')}
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(true)}
          className={tabClass(moreOpen || on('analytics', 'trash', 'settings'))}
        >
          <MoreIcon className="size-5" />
          Mehr
        </button>
      </nav>

      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} placement="sheet" closeOnBackdrop labelledBy="more-sheet-title">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong" aria-hidden="true" />
        <h2 id="more-sheet-title" className="px-5 pt-3 pb-1 text-sm font-semibold text-fg">
          Mehr
        </h2>
        <ul className="px-2" onClick={() => setMoreOpen(false)}>
          {withBoard && (
            <SheetLink to={paths.analytics(activeProject.id)} icon={<ChartIcon className="size-5" />} active={section === 'analytics'}>
              Statistiken
            </SheetLink>
          )}
          {activeProject && (
            <>
              <SheetLink to={paths.trash(activeProject.id)} icon={<TrashIcon className="size-5" />} active={section === 'trash'}>
                Papierkorb
                {trashCount > 0 && <span className="ml-auto text-xs text-fg-subtle tabular-nums">{trashCount}</span>}
              </SheetLink>
              <SheetLink to={paths.settings(activeProject.id)} icon={<SettingsIcon className="size-5" />} active={section === 'settings'}>
                Einstellungen
              </SheetLink>
              <SheetLink to={withActivityDrawer(pathname, search)} icon={<HistoryIcon className="size-5" />} active={false}>
                Aktivität
              </SheetLink>
            </>
          )}
        </ul>
        <div className="mt-2 flex items-center justify-between gap-3 border-t border-line px-5 py-4">
          <span className="text-sm text-fg-muted">Farbschema</span>
          <ThemeSwitcher />
        </div>
      </Dialog>
    </>
  );
}

function SheetLink({ to, icon, active, children }: { to: string; icon: ReactNode; active: boolean; children: ReactNode }) {
  return (
    <li>
      <Link
        to={to}
        aria-current={active ? 'page' : undefined}
        className={`flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${
          active ? 'bg-surface-strong font-medium text-fg' : 'text-fg-muted active:bg-surface-hover'
        }`}
      >
        <span className="text-fg-subtle">{icon}</span>
        {children}
      </Link>
    </li>
  );
}

import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useMatch, useSearchParams } from 'react-router';
import { useAuth } from '../../hooks/useAuth';
import { useNotesView } from '../../hooks/useNotesView';
import { useProjects } from '../../hooks/useProjects';
import type { Project } from '../../types/project';
import { notesApi } from '../../utils/api';
import { onNotesChanged, requestNewProject } from '../../utils/appEvents';
import { allNotesPath, KNOWLEDGE_PATH, paths, TAG_PARAM } from '../../utils/paths';
import { can } from '../../utils/permissions';
import { hasBoard } from '../../utils/projects';
import { BoardIcon, ChevronDownIcon, ChevronRightIcon, NoteIcon, PlusIcon } from '../icons';
import Menu, { type MenuItem } from '../Menu';
import NotesViewMenu from '../notes/NotesViewMenu';
import ManageProjectDialogs, { type ManageDialog } from '../projects/ManageProjectDialogs';
import { ProjectMark } from '../projects/ProjectSwitcher';
import Dialog from '../ui/Dialog';
import { NotebookTreeSlot } from './notebookTreeSlot';
import { iconButtonClass } from '../ui/styles';

const rowClass = (active: boolean) =>
  `flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
    active ? 'bg-surface-strong font-medium text-fg' : 'text-fg-muted hover:bg-surface-hover hover:text-fg'
  }`;

function Heading({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <div className="flex h-7 items-center justify-between px-2 pt-4 pb-1">
      <h2 className="text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">{children}</h2>
      {action}
    </div>
  );
}

/**
 * The left column of the notes (US-22; since US-26 one area for all notebooks, OneNote-style): "Alle Notizen", every
 * notebook with board or without (each with its menu for editing, members and deleting) and, if chosen, the tags of all
 * notes. In the tree view (US-34) the open notebook's folders and notes hang under it: `onSlot` receives the place for
 * them. On phones (US-25) the same list opens as a sheet (`inSheet`); `onNavigate` closes it once a link was chosen.
 */
function KnowledgeSidebar({
  inSheet = false,
  onNavigate,
  onSlot,
}: {
  inSheet?: boolean;
  onNavigate?: () => void;
  onSlot?: (element: HTMLElement | null) => void;
}) {
  const { projects: notebooks, reload } = useProjects();
  const withMembers = useAuth().session?.mode === 'required';
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const onAllNotes = useMatch(`${KNOWLEDGE_PATH}/*`) !== null;
  const activeNotebookId = Number(useMatch('/p/:projectId/*')?.params.projectId);
  const activeTags = onAllNotes ? searchParams.getAll(TAG_PARAM) : [];
  const [tags, setTags] = useState<{ name: string; noteCount: number }[]>([]);
  const [view] = useNotesView();
  const tree = view.layout === 'tree' && !inSheet;
  const [managing, setManaging] = useState<{ project: Project; dialog: ManageDialog } | null>(null);

  // Fresh tag counts on every page, and tag and note counts whenever a note was created, saved or deleted.
  useEffect(() => {
    const load = () =>
      notesApi.allTags().then(setTags, () => {
        // Without tags, the notebooks still work.
      });
    void load();
    return onNotesChanged(() => {
      void load();
      void reload();
    });
  }, [location.pathname, reload]);

  const menuItems = (notebook: Project): MenuItem[] => [
    ...(can(notebook.role, 'manageProject')
      ? [{ label: 'Bearbeiten …', onSelect: () => setManaging({ project: notebook, dialog: 'edit' }) }]
      : []),
    ...(withMembers ? [{ label: 'Mitglieder …', onSelect: () => setManaging({ project: notebook, dialog: 'members' }) }] : []),
  ];

  return (
    <nav
      aria-label="Notizbücher"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('a')) onNavigate?.();
      }}
      className={
        inSheet
          ? 'flex flex-col px-2 pb-4'
          : `flex shrink-0 flex-col overflow-y-auto border-r border-line bg-canvas px-2 pb-4 max-md:hidden ${tree ? 'w-60 xl:w-64' : 'w-52 xl:w-60'}`
      }
    >
      <div className="pt-3">
        <Link
          to={KNOWLEDGE_PATH}
          aria-current={onAllNotes && activeTags.length === 0 ? 'page' : undefined}
          className={rowClass(onAllNotes && activeTags.length === 0)}
        >
          <NoteIcon className="size-4 shrink-0 text-fg-subtle" />
          <span className="flex-1 truncate">Alle Notizen</span>
          <span className="text-xs text-fg-subtle tabular-nums">{notebooks.reduce((sum, n) => sum + n.noteCount, 0)}</span>
        </Link>
      </div>

      <Heading
        action={
          <div className="flex items-center gap-0.5">
            {!inSheet && <NotesViewMenu />}
            <button
              type="button"
              className={`${iconButtonClass} !size-6`}
              title="Neues Notizbuch"
              aria-label="Neues Notizbuch"
              onClick={() => requestNewProject('notebook')}
            >
              <PlusIcon className="size-3.5" />
            </button>
          </div>
        }
      >
        Notizbücher
      </Heading>
      {notebooks.length === 0 ? (
        <div className="px-2 py-2 text-xs text-fg-subtle">
          <p>Ein Notizbuch sammelt Notizen ohne Board – etwa Rezepte, Mitschriften oder Ideen.</p>
          <button type="button" className="mt-2 font-medium text-accent-text hover:underline" onClick={() => requestNewProject('notebook')}>
            Erstes Notizbuch anlegen
          </button>
        </div>
      ) : (
        <ul className="space-y-0.5">
          {notebooks.map((notebook) => {
            const active = notebook.id === activeNotebookId;
            const items = menuItems(notebook);
            return (
              <li key={notebook.id}>
                <div className="group flex items-center gap-0.5">
                  <Link to={paths.notes(notebook.id)} aria-current={active ? 'page' : undefined} className={rowClass(active)}>
                    {tree && (
                      <ChevronRightIcon
                        aria-hidden="true"
                        className={`-mr-1 size-3.5 shrink-0 text-fg-faint transition-transform duration-150 ${active ? 'rotate-90' : ''}`}
                      />
                    )}
                    <ProjectMark project={notebook} />
                    <span className="flex-1 truncate">{notebook.name}</span>
                    {hasBoard(notebook) && (
                      <span title="Mit Board" className="shrink-0 text-fg-faint">
                        <BoardIcon className="size-3.5" aria-hidden="true" />
                        <span className="sr-only">(mit Board)</span>
                      </span>
                    )}
                    <span className="text-xs text-fg-subtle tabular-nums group-hover:hidden group-focus-within:hidden">{notebook.noteCount}</span>
                  </Link>
                  {items.length > 0 && (
                    <div className="hidden group-hover:block group-focus-within:block pointer-coarse:block">
                      <Menu
                        label={`Notizbuch „${notebook.name}“: Aktionen`}
                        trigger={<span aria-hidden="true">⋯</span>}
                        triggerClassName={`${iconButtonClass} !size-7`}
                        items={items}
                      />
                    </div>
                  )}
                </div>
                {/* The notebook view (US-34): the notes page puts this notebook's sections here. */}
                {tree && active && <div ref={onSlot} className="pl-3" />}
              </li>
            );
          })}
        </ul>
      )}

      {view.showTags && tags.length > 0 && (
        <>
          <Heading>Tags</Heading>
          <ul className="space-y-0.5">
            {tags.map((tag) => {
              const active = activeTags.length === 1 && activeTags[0] === tag.name;
              return (
                <li key={tag.name} className="flex">
                  <Link
                    to={active ? KNOWLEDGE_PATH : allNotesPath(undefined, [tag.name])}
                    aria-current={active ? 'page' : undefined}
                    title={active ? 'Filter aufheben' : `Alle Notizen mit „${tag.name}“`}
                    className={rowClass(active)}
                  >
                    <span className="grid size-4 shrink-0 place-items-center text-fg-subtle" aria-hidden="true">
                      #
                    </span>
                    <span className="flex-1 truncate">{tag.name}</span>
                    <span className="text-xs text-fg-subtle tabular-nums">{tag.noteCount}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {managing && (
        <ManageProjectDialogs
          project={managing.project}
          dialog={managing.dialog}
          onDialogChange={(dialog) => setManaging(dialog ? { ...managing, dialog } : null)}
        />
      )}
    </nav>
  );
}

/**
 * Phones (US-25): a bar above the list names the place shown (Alle Notizen, a notebook or a tag) and opens the
 * sidebar as a sheet. While a note is open, its back bar takes the place.
 */
function KnowledgeSheetButton() {
  const [open, setOpen] = useState(false);
  const { projects } = useProjects();
  const [searchParams] = useSearchParams();
  const notebookId = Number(useMatch('/p/:projectId/*')?.params.projectId);
  const notebookNote = useMatch('/p/:projectId/notes/:noteId');
  const allNotesNote = useMatch(`${KNOWLEDGE_PATH}/notizen/:noteId`);
  const tags = searchParams.getAll(TAG_PARAM);
  const place = projects.find((p) => p.id === notebookId)?.name ?? (tags.length > 0 ? tags.map((t) => `#${t}`).join(' ') : 'Alle Notizen');
  if (notebookNote || allNotesNote) return null;

  return (
    <div className="flex shrink-0 items-center border-b border-line bg-canvas px-2 md:hidden">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex min-h-11 min-w-0 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-fg"
      >
        <span className="text-fg-subtle">Notizen ·</span>
        <span className="truncate">{place}</span>
        <ChevronDownIcon className="size-4 shrink-0 text-fg-subtle" />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} placement="sheet" closeOnBackdrop labelledBy="knowledge-sheet-title">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong" aria-hidden="true" />
        <h2 id="knowledge-sheet-title" className="sr-only">
          Notizbücher
        </h2>
        {/* Only while open: the sidebar loads the tags itself. */}
        {open && <KnowledgeSidebar inSheet onNavigate={() => setOpen(false)} />}
      </Dialog>
    </div>
  );
}

/** The notes (US-22, US-26): the sidebar of notebooks and tags beside "Alle Notizen" or a notebook's notes. */
export default function KnowledgeLayout({ children }: { children: ReactNode }) {
  // Where the tree view puts the open notebook's folders and notes (US-34).
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return (
    <div className="flex min-h-0 flex-1">
      <KnowledgeSidebar onSlot={setSlot} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <KnowledgeSheetButton />
        <NotebookTreeSlot.Provider value={slot}>{children}</NotebookTreeSlot.Provider>
      </div>
    </div>
  );
}

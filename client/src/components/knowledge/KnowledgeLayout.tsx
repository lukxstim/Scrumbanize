import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useMatch, useSearchParams } from 'react-router';
import { useAuth } from '../../hooks/useAuth';
import { useProjects } from '../../hooks/useProjects';
import type { Project } from '../../types/project';
import { notesApi } from '../../utils/api';
import { onNotesChanged, requestNewProject } from '../../utils/appEvents';
import { allNotesPath, KNOWLEDGE_PATH, paths, TAG_PARAM } from '../../utils/paths';
import { can } from '../../utils/permissions';
import { ofKind } from '../../utils/projects';
import { NoteIcon, PlusIcon } from '../icons';
import Menu, { type MenuItem } from '../Menu';
import ManageProjectDialogs, { type ManageDialog } from '../projects/ManageProjectDialogs';
import NotebookSymbol from '../projects/NotebookSymbol';
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
 * The left column of Wissen (US-22), on "Alle Notizen" and inside every notebook: "Alle Notizen", the notebooks
 * (each with its menu for editing, members and deleting) and the tags of all notebook notes.
 */
function KnowledgeSidebar() {
  const { projects, reload } = useProjects();
  const notebooks = ofKind(projects, 'notebook');
  const withMembers = useAuth().session?.mode === 'required';
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const onAllNotes = useMatch(`${KNOWLEDGE_PATH}/*`) !== null;
  const activeNotebookId = Number(useMatch('/p/:projectId/*')?.params.projectId);
  const activeTags = onAllNotes ? searchParams.getAll(TAG_PARAM) : [];
  const [tags, setTags] = useState<{ name: string; noteCount: number }[]>([]);
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
    <nav aria-label="Wissen" className="flex w-52 shrink-0 flex-col overflow-y-auto border-r border-line bg-canvas px-2 pb-4 xl:w-60">
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
          <button
            type="button"
            className={`${iconButtonClass} !size-6`}
            title="Neues Notizbuch"
            aria-label="Neues Notizbuch"
            onClick={() => requestNewProject('notebook')}
          >
            <PlusIcon className="size-3.5" />
          </button>
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
              <li key={notebook.id} className="group flex items-center gap-0.5">
                <Link to={paths.notes(notebook.id)} aria-current={active ? 'page' : undefined} className={rowClass(active)}>
                  <NotebookSymbol icon={notebook.icon} color={notebook.color} />
                  <span className="flex-1 truncate">{notebook.name}</span>
                  <span className="text-xs text-fg-subtle tabular-nums group-hover:hidden group-focus-within:hidden">{notebook.noteCount}</span>
                </Link>
                {items.length > 0 && (
                  <div className="hidden group-hover:block group-focus-within:block">
                    <Menu
                      label={`Notizbuch „${notebook.name}“: Aktionen`}
                      trigger={<span aria-hidden="true">⋯</span>}
                      triggerClassName={`${iconButtonClass} !size-7`}
                      items={items}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {tags.length > 0 && (
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

/** Wissen (US-22): the sidebar of notebooks and tags beside "Alle Notizen" or a notebook's pages. */
export default function KnowledgeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1">
      <KnowledgeSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

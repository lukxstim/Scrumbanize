import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../hooks/useAuth';
import { useProjects } from '../../hooks/useProjects';
import { useToast } from '../../hooks/useToast';
import type { Project, ProjectInput } from '../../types/project';
import { trashApi } from '../../utils/api';
import { requestNewProject } from '../../utils/appEvents';
import { KNOWLEDGE_PATH, sectionPath, type Section } from '../../utils/paths';
import { can, ROLE_LABELS } from '../../utils/permissions';
import { colorDot, countLabel, KIND_WORDS, ofKind } from '../../utils/projects';
import { CheckIcon, ChevronDownIcon, PencilIcon, PlusIcon, UsersIcon } from '../icons';
import { menuItemClass, popoverClass } from '../ui/styles';
import DeleteProjectDialog from './DeleteProjectDialog';
import MembersDialog from './MembersDialog';
import NotebookSymbol from './NotebookSymbol';
import ProjectDialog from './ProjectDialog';

interface ProjectSwitcherProps {
  active: Project;
  /** The page to show after switching, so the user stays on notes or on the board. */
  section: Section;
}

type OpenDialog = 'edit' | 'delete' | 'members' | null;

/** A project's color dot, or a notebook's symbol (US-22). */
export function ProjectMark({ project }: { project: Project }) {
  return project.kind === 'notebook' ? (
    <NotebookSymbol icon={project.icon} color={project.color} />
  ) : (
    <span className={`size-2.5 shrink-0 rounded-full ${colorDot(project.color)}`} aria-hidden="true" />
  );
}

/** Switches between projects, or – inside a notebook – between notebooks (US-22). */
export default function ProjectSwitcher({ active, section }: ProjectSwitcherProps) {
  const { projects: all, reload, updateProject, deleteProject } = useProjects();
  const kind = active.kind;
  const notebook = kind === 'notebook';
  const word = KIND_WORDS[kind];
  const projects = ofKind(all, kind);
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  // Members and roles only exist with login (US-21); the desktop app has one user.
  const withMembers = useAuth().session?.mode === 'required';
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const menuItems = () => [...(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];

  function closeMenu(focusButton = true) {
    setMenuOpen(false);
    if (focusButton) buttonRef.current?.focus();
  }

  useEffect(() => {
    if (!menuOpen) return;
    void reload(); // current note and task counts
    // Start on the active project, like a native select.
    (menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? menuItems()[0])?.focus();

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [menuOpen, reload]);

  function onMenuKeyDown(event: KeyboardEvent) {
    const items = menuItems();
    const index = items.indexOf(document.activeElement as HTMLElement);
    const focus = (i: number) => items[(i + items.length) % items.length]?.focus();

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focus(index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focus(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focus(0);
        break;
      case 'End':
        event.preventDefault();
        focus(items.length - 1);
        break;
      case 'Escape':
        event.preventDefault();
        closeMenu();
        break;
      case 'Tab':
        closeMenu(false);
        break;
    }
  }

  function switchTo(project: Project) {
    closeMenu();
    // Notebooks only have notes (and their graph, trash and settings).
    const target = notebook && !['notes', 'graph', 'trash', 'settings'].includes(section) ? 'notes' : section;
    if (project.id !== active.id) navigate(sectionPath(project.id, target));
  }

  function openDialog(which: OpenDialog) {
    closeMenu(false);
    setDialog(which);
  }

  async function save(input: ProjectInput) {
    // The kind never changes.
    const { kind: _kind, ...patch } = input;
    await updateProject(active.id, patch);
    setDialog(null);
    toast({ message: `${word.one} gespeichert.` });
  }

  async function remove() {
    const { id, name } = active;
    await deleteProject(active.id);
    setDialog(null);
    navigate(notebook ? KNOWLEDGE_PATH : '/', { replace: true });
    toast({
      message: `${word.one} „${name}“ in den Papierkorb verschoben.`,
      action: {
        label: 'Rückgängig',
        onClick: async () => {
          try {
            const result = await trashApi.restore('project', id);
            await reload();
            navigate(sectionPath(id, 'notes'));
            if (result.type === 'project' && result.renamedFrom) {
              toast({ message: `Wiederhergestellt als „${result.item.name}“ – der Name war inzwischen vergeben.` });
            }
          } catch {
            toast({ message: `${notebook ? 'Das Notizbuch' : 'Das Projekt'} konnte nicht wiederhergestellt werden.`, tone: 'error' });
          }
        },
      },
    });
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`${word.one}: ${active.name}. ${word.one} wechseln`}
        data-tour="project-switcher"
        onClick={() => setMenuOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !menuOpen) {
            event.preventDefault();
            setMenuOpen(true);
          }
        }}
        className="flex h-8 max-w-36 items-center gap-2 lg:max-w-44 2xl:max-w-64 rounded-md px-2.5 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent aria-expanded:bg-surface-hover"
      >
        <ProjectMark project={active} />
        <span className="truncate">{active.name}</span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-fg-subtle" />
      </button>

      {menuOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={word.many}
          onKeyDown={onMenuKeyDown}
          className={`absolute left-0 top-full z-30 mt-1 w-72 origin-top-left ${popoverClass}`}
        >
          <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle" aria-hidden="true">
            {word.many}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                role="menuitemradio"
                aria-checked={project.id === active.id}
                onClick={() => switchTo(project)}
                className={`py-2 ${menuItemClass}`}
              >
                <ProjectMark project={project} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">{project.name}</span>
                  <span className="block text-xs text-fg-subtle">
                    {countLabel(project.noteCount, 'Notiz', 'Notizen')}
                    {!notebook && ` · ${countLabel(project.taskCount, 'Task', 'Tasks')}`}
                    {withMembers && project.role !== 'owner' && ` · ${ROLE_LABELS[project.role]}`}
                  </span>
                </span>
                {project.id === active.id && <CheckIcon className="size-4 shrink-0 text-accent-text" />}
              </button>
            ))}
          </div>
          <div role="separator" className="my-1 border-t border-line" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeMenu(false);
              requestNewProject(kind);
            }}
            className={`py-2 ${menuItemClass}`}
          >
            <PlusIcon className="size-4 text-fg-subtle" />
            {word.new}
          </button>
          {withMembers && (
            <button type="button" role="menuitem" onClick={() => openDialog('members')} className={`py-2 ${menuItemClass}`}>
              <UsersIcon className="size-4 text-fg-subtle" />
              <span className="truncate">Mitglieder von „{active.name}“ …</span>
            </button>
          )}
          {can(active.role, 'manageProject') && (
            <button type="button" role="menuitem" onClick={() => openDialog('edit')} className={`py-2 ${menuItemClass}`}>
              <PencilIcon className="size-4 text-fg-subtle" />
              <span className="truncate">„{active.name}“ bearbeiten …</span>
            </button>
          )}
        </div>
      )}

      {dialog === 'edit' && (
        <ProjectDialog
          mode="edit"
          initial={{ name: active.name, color: active.color, kind, icon: active.icon }}
          onSubmit={save}
          onClose={() => setDialog(null)}
          onDelete={() => setDialog('delete')}
          deleteDisabledReason={!notebook && projects.length <= 1 ? 'Das letzte Projekt kann nicht gelöscht werden.' : undefined}
        />
      )}
      {dialog === 'members' && <MembersDialog project={active} onClose={() => setDialog(null)} />}
      {dialog === 'delete' && (
        <DeleteProjectDialog project={active} onConfirm={remove} onClose={() => setDialog('edit')} />
      )}
    </div>
  );
}

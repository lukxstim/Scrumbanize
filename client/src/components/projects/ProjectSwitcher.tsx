import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { useProjects } from '../../hooks/useProjects';
import { useToast } from '../../hooks/useToast';
import type { Project, ProjectInput } from '../../types/project';
import { trashApi } from '../../utils/api';
import { onNewProjectRequest } from '../../utils/appEvents';
import { paths, sectionPath, type Section } from '../../utils/paths';
import { colorDot, countLabel, PROJECT_COLORS } from '../../utils/projects';
import { CheckIcon, ChevronDownIcon, PencilIcon, PlusIcon } from '../icons';
import { menuItemClass, popoverClass } from '../ui/styles';
import DeleteProjectDialog from './DeleteProjectDialog';
import ProjectDialog from './ProjectDialog';

interface ProjectSwitcherProps {
  active: Project;
  /** The page to show after switching, so the user stays on notes or on the board. */
  section: Section;
}

type OpenDialog = 'create' | 'edit' | 'delete' | null;

export default function ProjectSwitcher({ active, section }: ProjectSwitcherProps) {
  const { projects, reload, createProject, updateProject, deleteProject } = useProjects();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  // "Neues Projekt" from the command palette.
  useEffect(() => onNewProjectRequest(() => setDialog('create')), []);

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
    if (project.id !== active.id) navigate(sectionPath(project.id, section));
  }

  function openDialog(which: OpenDialog) {
    closeMenu(false);
    setDialog(which);
  }

  async function create(input: ProjectInput) {
    const project = await createProject(input);
    setDialog(null);
    navigate(paths.notes(project.id));
    toast({ message: `Projekt „${project.name}“ angelegt.` });
  }

  async function save(input: ProjectInput) {
    await updateProject(active.id, input);
    setDialog(null);
    toast({ message: 'Projekt gespeichert.' });
  }

  async function remove() {
    const { id, name } = active;
    await deleteProject(active.id);
    setDialog(null);
    navigate('/', { replace: true });
    toast({
      message: `Projekt „${name}“ in den Papierkorb verschoben.`,
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
            toast({ message: 'Das Projekt konnte nicht wiederhergestellt werden.', tone: 'error' });
          }
        },
      },
    });
  }

  // New projects start with a color that is not used yet, if there is one.
  const unusedColor = PROJECT_COLORS.find((c) => !projects.some((p) => p.color === c.value))?.value ?? 'indigo';

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`Projekt: ${active.name}. Projekt wechseln`}
        data-tour="project-switcher"
        onClick={() => setMenuOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !menuOpen) {
            event.preventDefault();
            setMenuOpen(true);
          }
        }}
        className="flex h-8 max-w-44 items-center gap-2 xl:max-w-64 rounded-md px-2.5 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent aria-expanded:bg-surface-hover"
      >
        <span className={`size-2.5 shrink-0 rounded-full ${colorDot(active.color)}`} aria-hidden="true" />
        <span className="truncate">{active.name}</span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-fg-subtle" />
      </button>

      {menuOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Projekte"
          onKeyDown={onMenuKeyDown}
          className={`absolute left-0 top-full z-30 mt-1 w-72 origin-top-left ${popoverClass}`}
        >
          <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle" aria-hidden="true">
            Projekte
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
                <span className={`size-2.5 shrink-0 rounded-full ${colorDot(project.color)}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">{project.name}</span>
                  <span className="block text-xs text-fg-subtle">
                    {countLabel(project.noteCount, 'Notiz', 'Notizen')} · {countLabel(project.taskCount, 'Task', 'Tasks')}
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
            onClick={() => openDialog('create')}
            className={`py-2 ${menuItemClass}`}
          >
            <PlusIcon className="size-4 text-fg-subtle" />
            Neues Projekt
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => openDialog('edit')}
            className={`py-2 ${menuItemClass}`}
          >
            <PencilIcon className="size-4 text-fg-subtle" />
            <span className="truncate">„{active.name}“ bearbeiten …</span>
          </button>
        </div>
      )}

      {dialog === 'create' && (
        <ProjectDialog
          mode="create"
          initial={{ name: '', color: unusedColor }}
          onSubmit={create}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'edit' && (
        <ProjectDialog
          mode="edit"
          initial={{ name: active.name, color: active.color }}
          onSubmit={save}
          onClose={() => setDialog(null)}
          onDelete={() => setDialog('delete')}
          deleteDisabledReason={projects.length <= 1 ? 'Das letzte Projekt kann nicht gelöscht werden.' : undefined}
        />
      )}
      {dialog === 'delete' && (
        <DeleteProjectDialog project={active} onConfirm={remove} onClose={() => setDialog('edit')} />
      )}
    </div>
  );
}

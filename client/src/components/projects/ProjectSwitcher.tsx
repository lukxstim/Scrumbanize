import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { useProjects } from '../../hooks/useProjects';
import type { Project, ProjectInput } from '../../types/project';
import { paths, type Section } from '../../utils/paths';
import { colorDot, countLabel, PROJECT_COLORS } from '../../utils/projects';
import { CheckIcon, ChevronDownIcon, PencilIcon, PlusIcon } from '../icons';
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
    if (project.id !== active.id) navigate(section === 'board' ? paths.board(project.id) : paths.notes(project.id));
  }

  function openDialog(which: OpenDialog) {
    closeMenu(false);
    setDialog(which);
  }

  async function create(input: ProjectInput) {
    const project = await createProject(input);
    setDialog(null);
    navigate(paths.notes(project.id));
  }

  async function save(input: ProjectInput) {
    await updateProject(active.id, input);
    setDialog(null);
  }

  async function remove() {
    await deleteProject(active.id);
    setDialog(null);
    navigate('/', { replace: true });
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
        onClick={() => setMenuOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !menuOpen) {
            event.preventDefault();
            setMenuOpen(true);
          }
        }}
        className="flex max-w-64 items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-100 aria-expanded:bg-slate-100"
      >
        <span className={`size-2.5 shrink-0 rounded-full ${colorDot(active.color)}`} aria-hidden="true" />
        <span className="truncate">{active.name}</span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-slate-400" />
      </button>

      {menuOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Projekte"
          onKeyDown={onMenuKeyDown}
          className="absolute left-0 top-full z-20 mt-1 w-72 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400" aria-hidden="true">
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
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 focus:bg-slate-100 focus:outline-none"
              >
                <span className={`size-2.5 shrink-0 rounded-full ${colorDot(project.color)}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">{project.name}</span>
                  <span className="block text-xs text-slate-500">
                    {countLabel(project.noteCount, 'Notiz', 'Notizen')} · {countLabel(project.taskCount, 'Task', 'Tasks')}
                  </span>
                </span>
                {project.id === active.id && <CheckIcon className="size-4 shrink-0 text-indigo-600" />}
              </button>
            ))}
          </div>
          <div role="separator" className="my-1 border-t border-slate-100" />
          <button
            type="button"
            role="menuitem"
            onClick={() => openDialog('create')}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 focus:bg-slate-100 focus:outline-none"
          >
            <PlusIcon className="size-4 text-slate-400" />
            Neues Projekt
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => openDialog('edit')}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 focus:bg-slate-100 focus:outline-none"
          >
            <PencilIcon className="size-4 text-slate-400" />
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

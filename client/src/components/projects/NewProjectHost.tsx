import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useProjects } from '../../hooks/useProjects';
import { useToast } from '../../hooks/useToast';
import type { ProjectKind } from '../../types/project';
import { onNewProjectRequest } from '../../utils/appEvents';
import { paths } from '../../utils/paths';
import { PROJECT_COLORS } from '../../utils/projects';
import ProjectDialog, { type NotebookValues } from './ProjectDialog';

/**
 * The "Neues Notizbuch" dialog for the whole app (US-22, US-26): the switcher, the sidebar of notebooks and the command
 * palette ask for it with requestNewProject(kind), wherever the user is; 'project' starts with the board switched on.
 */
export default function NewProjectHost() {
  const { projects, createProject } = useProjects();
  const navigate = useNavigate();
  const toast = useToast();
  const [kind, setKind] = useState<ProjectKind | null>(null);

  useEffect(() => onNewProjectRequest(setKind), []);
  if (!kind) return null;

  // New ones start with a color no notebook uses yet, if there is one.
  const unusedColor = PROJECT_COLORS.find((c) => !projects.some((p) => p.color === c.value))?.value ?? 'indigo';

  async function create({ board, ...values }: NotebookValues) {
    const project = await createProject({ ...values, kind: board ? 'project' : 'notebook' });
    setKind(null);
    navigate(paths.notes(project.id));
    toast({ message: `Notizbuch „${project.name}“ angelegt.` });
  }

  return (
    <ProjectDialog
      mode="create"
      initial={{ name: '', color: unusedColor, icon: 'book', board: kind === 'project' }}
      onSubmit={create}
      onClose={() => setKind(null)}
    />
  );
}

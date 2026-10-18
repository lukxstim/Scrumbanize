import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useProjects } from '../../hooks/useProjects';
import { useToast } from '../../hooks/useToast';
import type { ProjectInput, ProjectKind } from '../../types/project';
import { onNewProjectRequest } from '../../utils/appEvents';
import { paths } from '../../utils/paths';
import { KIND_WORDS, ofKind, PROJECT_COLORS } from '../../utils/projects';
import ProjectDialog from './ProjectDialog';

/**
 * The "Neues Projekt" / "Neues Notizbuch" dialog for the whole app (US-22): the switcher, the notebook overview and
 * the command palette ask for it with requestNewProject(kind), wherever the user is.
 */
export default function NewProjectHost() {
  const { projects, createProject } = useProjects();
  const navigate = useNavigate();
  const toast = useToast();
  const [kind, setKind] = useState<ProjectKind | null>(null);

  useEffect(() => onNewProjectRequest(setKind), []);
  if (!kind) return null;

  // New ones start with a color their kind does not use yet, if there is one.
  const sameKind = ofKind(projects, kind);
  const unusedColor = PROJECT_COLORS.find((c) => !sameKind.some((p) => p.color === c.value))?.value ?? 'indigo';

  async function create(input: ProjectInput) {
    const project = await createProject(input);
    setKind(null);
    navigate(paths.notes(project.id));
    toast({ message: `${KIND_WORDS[project.kind].one} „${project.name}“ angelegt.` });
  }

  return (
    <ProjectDialog
      mode="create"
      initial={{ name: '', color: unusedColor, kind, icon: kind === 'notebook' ? 'book' : null }}
      onSubmit={create}
      onClose={() => setKind(null)}
    />
  );
}

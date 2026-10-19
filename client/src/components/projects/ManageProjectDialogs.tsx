import { useLocation, useNavigate } from 'react-router';
import { useProjects } from '../../hooks/useProjects';
import { useToast } from '../../hooks/useToast';
import type { Project, ProjectInput } from '../../types/project';
import { trashApi } from '../../utils/api';
import { KNOWLEDGE_PATH, sectionPath } from '../../utils/paths';
import { KIND_WORDS, ofKind } from '../../utils/projects';
import DeleteProjectDialog from './DeleteProjectDialog';
import MembersDialog from './MembersDialog';
import ProjectDialog from './ProjectDialog';

export type ManageDialog = 'edit' | 'delete' | 'members';

interface ManageProjectDialogsProps {
  project: Project;
  dialog: ManageDialog | null;
  onDialogChange: (dialog: ManageDialog | null) => void;
}

/**
 * Editing, members and deleting of a project or notebook: from the project switcher and from the notebooks in the
 * sidebar of Wissen (US-22). Deleting moves it to the trash; the toast can take it back.
 */
export default function ManageProjectDialogs({ project, dialog, onDialogChange }: ManageProjectDialogsProps) {
  const { projects, reload, updateProject, deleteProject } = useProjects();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const notebook = project.kind === 'notebook';
  const word = KIND_WORDS[project.kind];

  async function save(input: ProjectInput) {
    // The kind never changes.
    const { kind: _kind, ...patch } = input;
    await updateProject(project.id, patch);
    onDialogChange(null);
    toast({ message: `${word.one} gespeichert.` });
  }

  async function remove() {
    const { id, name } = project;
    // Only leave the page if it belongs to what is deleted.
    const shown = location.pathname.startsWith(`/p/${id}/`);
    await deleteProject(id);
    onDialogChange(null);
    if (shown) navigate(notebook ? KNOWLEDGE_PATH : '/', { replace: true });
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
    <>
      {dialog === 'edit' && (
        <ProjectDialog
          mode="edit"
          initial={{ name: project.name, color: project.color, kind: project.kind, icon: project.icon }}
          onSubmit={save}
          onClose={() => onDialogChange(null)}
          onDelete={() => onDialogChange('delete')}
          deleteDisabledReason={
            !notebook && ofKind(projects, 'project').length <= 1 ? 'Das letzte Projekt kann nicht gelöscht werden.' : undefined
          }
        />
      )}
      {dialog === 'members' && <MembersDialog project={project} onClose={() => onDialogChange(null)} />}
      {dialog === 'delete' && <DeleteProjectDialog project={project} onConfirm={remove} onClose={() => onDialogChange('edit')} />}
    </>
  );
}

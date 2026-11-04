import { useLocation, useNavigate } from 'react-router';
import { useProjects } from '../../hooks/useProjects';
import { useToast } from '../../hooks/useToast';
import type { Project } from '../../types/project';
import { trashApi } from '../../utils/api';
import { sectionPath } from '../../utils/paths';
import { hasBoard } from '../../utils/projects';
import DeleteProjectDialog from './DeleteProjectDialog';
import MembersDialog from './MembersDialog';
import ProjectDialog, { type NotebookValues } from './ProjectDialog';

export type ManageDialog = 'edit' | 'delete' | 'members';

interface ManageProjectDialogsProps {
  project: Project;
  dialog: ManageDialog | null;
  onDialogChange: (dialog: ManageDialog | null) => void;
}

/**
 * Editing (also switching the board on and off, US-26), members and deleting of a notebook: from the switcher and from
 * the sidebar of notebooks. Deleting moves it to the trash; the toast can take it back.
 */
export default function ManageProjectDialogs({ project, dialog, onDialogChange }: ManageProjectDialogsProps) {
  const { projects, reload, updateProject, deleteProject } = useProjects();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const board = hasBoard(project);

  async function save(values: NotebookValues) {
    await updateProject(project.id, values);
    onDialogChange(null);
    toast({
      message:
        values.board === board
          ? 'Notizbuch gespeichert.'
          : values.board
            ? `Board für „${values.name}“ eingeschaltet.`
            : `Board für „${values.name}“ ausgeschaltet – die Aufgaben sind ausgeblendet.`,
    });
  }

  async function remove() {
    const { id, name } = project;
    // Only leave the page if it belongs to what is deleted.
    const shown = location.pathname.startsWith(`/p/${id}/`);
    await deleteProject(id);
    onDialogChange(null);
    if (shown) navigate('/', { replace: true });
    toast({
      message: `Notizbuch „${name}“ in den Papierkorb verschoben.`,
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
            toast({ message: 'Das Notizbuch konnte nicht wiederhergestellt werden.', tone: 'error' });
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
          initial={{ name: project.name, color: project.color, icon: project.icon, board }}
          taskCount={project.taskCount}
          onSubmit={save}
          onClose={() => onDialogChange(null)}
          onDelete={() => onDialogChange('delete')}
          deleteDisabledReason={
            board && projects.filter(hasBoard).length <= 1 ? 'Das letzte Notizbuch mit Board kann nicht gelöscht werden.' : undefined
          }
        />
      )}
      {dialog === 'members' && <MembersDialog project={project} onClose={() => onDialogChange(null)} />}
      {dialog === 'delete' && <DeleteProjectDialog project={project} onConfirm={remove} onClose={() => onDialogChange('edit')} />}
    </>
  );
}

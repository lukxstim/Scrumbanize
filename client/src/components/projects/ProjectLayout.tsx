import { Fragment, useEffect } from 'react';
import { Navigate, Outlet, useMatch, useParams } from 'react-router';
import { useProjects } from '../../hooks/useProjects';
import { paths } from '../../utils/paths';
import { setLastProjectId } from '../../utils/projects';
import RedirectToProject, { ProjectsLoading } from './RedirectToProject';

/** Everything under /p/:projectId. Unknown projects redirect; the pages restart for each project. */
export default function ProjectLayout() {
  const projectId = Number(useParams().projectId);
  const { projects, status } = useProjects();
  const project = projects.find((p) => p.id === projectId);
  const boardMatch = useMatch('/p/:projectId/board');
  const taskMatch = useMatch('/p/:projectId/tasks/:taskId');
  const calendarMatch = useMatch('/p/:projectId/calendar');
  const trashMatch = useMatch('/p/:projectId/trash');
  const analyticsMatch = useMatch('/p/:projectId/analytics');

  const notebook = project?.kind === 'notebook';
  // Notebooks are not "the last project": the logo and unknown addresses lead back to a project.
  useEffect(() => {
    if (project && project.kind === 'project') setLastProjectId(project.id);
  }, [project]);

  if (status !== 'ready') return <ProjectsLoading />;
  // Keep the requested page when falling back to another project.
  if (!project) {
    return <RedirectToProject
        section={
          trashMatch ? 'trash' : calendarMatch ? 'calendar' : boardMatch || taskMatch ? 'board' : 'notes'
        }
      />;
  }

  // A notebook has no board (US-22): its board, task, calendar and statistics addresses show the notes.
  if (notebook && (boardMatch || taskMatch || calendarMatch || analyticsMatch)) return <Navigate to={paths.notes(project.id)} replace />;

  // A new key per project resets search, filters and loaded data when switching projects.
  return (
    <Fragment key={project.id}>
      <Outlet />
    </Fragment>
  );
}

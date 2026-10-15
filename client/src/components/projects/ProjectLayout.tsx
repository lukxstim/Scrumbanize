import { Fragment, useEffect } from 'react';
import { Outlet, useMatch, useParams } from 'react-router';
import { useProjects } from '../../hooks/useProjects';
import { setLastProjectId } from '../../utils/projects';
import RedirectToProject, { ProjectsLoading } from './RedirectToProject';

/** Everything under /p/:projectId. Unknown projects redirect; the pages restart for each project. */
export default function ProjectLayout() {
  const projectId = Number(useParams().projectId);
  const { projects, status } = useProjects();
  const project = projects.find((p) => p.id === projectId);
  const boardMatch = useMatch('/p/:projectId/board');
  const taskMatch = useMatch('/p/:projectId/tasks/:taskId');
  const activityMatch = useMatch('/p/:projectId/activity');

  useEffect(() => {
    if (project) setLastProjectId(project.id);
  }, [project]);

  if (status !== 'ready') return <ProjectsLoading />;
  // Keep the requested page when falling back to another project.
  if (!project) {
    return <RedirectToProject section={activityMatch ? 'activity' : boardMatch || taskMatch ? 'board' : 'notes'} />;
  }

  // A new key per project resets search, filters and loaded data when switching projects.
  return (
    <Fragment key={project.id}>
      <Outlet />
    </Fragment>
  );
}

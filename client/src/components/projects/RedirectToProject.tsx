import { Navigate } from 'react-router';
import { useProjects } from '../../hooks/useProjects';
import { sectionPath, type Section } from '../../utils/paths';
import { defaultProject } from '../../utils/projects';
import Skeleton from '../ui/Skeleton';
import NoProjects from './NoProjects';

/** Placeholder while the project list loads, or an error with a retry button. */
export function ProjectsLoading() {
  const { status, reload } = useProjects();

  if (status === 'error') {
    return (
      <div className="p-6 text-sm text-danger-text">
        <p>Die Projekte konnten nicht geladen werden.</p>
        <button type="button" className="mt-2 underline" onClick={() => void reload()}>
          Erneut versuchen
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-3 p-6" aria-label="Lade Projekte …">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-4 w-80" />
      <Skeleton className="h-4 w-64" />
    </div>
  );
}

/** Sends addresses without a (valid) notebook to the last one used, or the first; board pages to one with a board. */
export default function RedirectToProject({ section = 'notes' }: { section?: Section }) {
  const { projects, status, sampleProjectId } = useProjects();
  const target = defaultProject(projects, sampleProjectId, ['board', 'calendar', 'analytics'].includes(section));

  if (status === 'ready' && projects.length === 0) return <NoProjects />;
  if (status !== 'ready' || !target) return <ProjectsLoading />;
  return <Navigate to={sectionPath(target.id, section)} replace />;
}

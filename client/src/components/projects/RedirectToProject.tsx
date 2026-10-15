import { Navigate } from 'react-router';
import { useProjects } from '../../hooks/useProjects';
import { paths, type Section } from '../../utils/paths';
import { defaultProject } from '../../utils/projects';

/** Placeholder while the project list loads, or an error with a retry button. */
export function ProjectsLoading() {
  const { status, reload } = useProjects();

  if (status === 'error') {
    return (
      <div className="p-6 text-sm text-red-600">
        <p>Die Projekte konnten nicht geladen werden.</p>
        <button type="button" className="mt-2 underline" onClick={() => void reload()}>
          Erneut versuchen
        </button>
      </div>
    );
  }
  return <p className="p-6 text-sm text-slate-500">Lade Projekte …</p>;
}

/** Sends addresses without a (valid) project to the last project used, or the first one. */
export default function RedirectToProject({ section = 'notes' }: { section?: Section }) {
  const { projects, status } = useProjects();
  const target = defaultProject(projects);

  if (status !== 'ready' || !target) return <ProjectsLoading />;
  return <Navigate to={section === 'board' ? paths.board(target.id) : paths.notes(target.id)} replace />;
}

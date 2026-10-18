import { useParams } from 'react-router';
import type { ProjectRole } from '../types/project';
import { can, type ProjectAction } from '../utils/permissions';
import { useProjects } from './useProjects';

/** The user's role in the project of the current page (US-21). */
export function useProjectRole(): ProjectRole | undefined {
  const projectId = Number(useParams().projectId);
  const { projects } = useProjects();
  return projects.find((p) => p.id === projectId)?.role;
}

/** Whether the user may do `action` in the project of the current page. */
export function useCan(action: ProjectAction): boolean {
  return can(useProjectRole(), action);
}

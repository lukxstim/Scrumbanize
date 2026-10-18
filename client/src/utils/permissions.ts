import type { ProjectRole } from '../types/project';

/**
 * What a role may do in a project (US-21); the server checks the same rules (server/src/auth/access.ts), the app only
 * hides what would be refused.
 * - edit: create and change notes, tasks, labels, attachments, links, project templates; import; restore from the trash
 * - manageBoard: columns, swimlanes, WIP limits, column widths
 * - manageProject: rename, recolor, delete the project; members; delete from the trash for good
 */
export type ProjectAction = 'edit' | 'manageBoard' | 'manageProject';

const MIN_ROLE: Record<ProjectAction, ProjectRole> = { edit: 'member', manageBoard: 'owner', manageProject: 'owner' };
const RANK: Record<ProjectRole, number> = { viewer: 1, member: 2, owner: 3 };

export function can(role: ProjectRole | undefined, action: ProjectAction): boolean {
  return role !== undefined && RANK[role] >= RANK[MIN_ROLE[action]];
}

export const ROLE_LABELS: Record<ProjectRole, string> = { owner: 'Owner', member: 'Mitglied', viewer: 'Betrachter' };

export const ROLE_DESCRIPTIONS: Record<ProjectRole, string> = {
  owner: 'Alles, auch Spalten, Swimlanes, Mitglieder und das Projekt selbst',
  member: 'Notizen und Tasks anlegen, bearbeiten und verschieben',
  viewer: 'Nur lesen: Board, Notizen, Kalender und Statistiken',
};

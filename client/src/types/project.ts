export type ProjectColor = 'slate' | 'red' | 'amber' | 'emerald' | 'sky' | 'indigo' | 'violet' | 'pink';

/** The user's role in a project (US-21); without login (desktop app) always owner. */
export type ProjectRole = 'owner' | 'member' | 'viewer';

export interface Project {
  id: number;
  name: string;
  color: ProjectColor;
  role: ProjectRole;
  noteCount: number;
  taskCount: number;
  createdAt: string;
  updatedAt: string;
}

export type ProjectInput = Pick<Project, 'name' | 'color'>;

/** A member of a project as the members dialog shows them. */
export interface ProjectMember {
  user: { id: number; name: string; email: string; avatarColor: ProjectColor; avatarUrl: string | null };
  role: ProjectRole;
}

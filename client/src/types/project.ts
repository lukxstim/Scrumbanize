export type ProjectColor = 'slate' | 'red' | 'amber' | 'emerald' | 'sky' | 'indigo' | 'violet' | 'pink';

/** The user's role in a project (US-21); without login (desktop app) always owner. */
export type ProjectRole = 'owner' | 'member' | 'viewer';

/** A project has a board; a notebook (US-22) has notes only. Since US-26 the board can be switched on and off. */
export type ProjectKind = 'project' | 'notebook';

/** The fixed symbols of notebooks, in picker order. */
export const NOTEBOOK_ICONS = [
  'book', 'briefcase', 'graduation', 'house', 'heart', 'star', 'lightbulb', 'code',
  'music', 'plane', 'utensils', 'leaf', 'dumbbell', 'camera', 'wallet', 'users',
] as const;
export type NotebookIcon = (typeof NOTEBOOK_ICONS)[number];

export interface Project {
  id: number;
  name: string;
  color: ProjectColor;
  kind: ProjectKind;
  /** Null shows the color dot instead (projects from before US-26). */
  icon: NotebookIcon | null;
  role: ProjectRole;
  noteCount: number;
  /** Also the hidden tasks of a board that is switched off (US-26). */
  taskCount: number;
  createdAt: string;
  updatedAt: string;
}

export type ProjectInput = Pick<Project, 'name' | 'color'> & { kind?: ProjectKind; icon?: NotebookIcon | null };

/** Changes; `board` switches it on or off (US-26), the tasks of a board switched off are only hidden. */
export type ProjectPatch = Partial<Pick<Project, 'name' | 'color'> & { icon: NotebookIcon | null; board: boolean }>;

/** A member of a project as the members dialog shows them. */
export interface ProjectMember {
  user: { id: number; name: string; email: string; avatarColor: ProjectColor; avatarUrl: string | null };
  role: ProjectRole;
}

export type ProjectColor = 'slate' | 'red' | 'amber' | 'emerald' | 'sky' | 'indigo' | 'violet' | 'pink';

export interface Project {
  id: number;
  name: string;
  color: ProjectColor;
  noteCount: number;
  taskCount: number;
  createdAt: string;
  updatedAt: string;
}

export type ProjectInput = Pick<Project, 'name' | 'color'>;

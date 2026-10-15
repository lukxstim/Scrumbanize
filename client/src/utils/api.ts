import type { Note, NoteInput } from '../types/note';
import type { Project, ProjectInput } from '../types/project';
import type { BoardColumn, Task, TaskInput, TaskPatch, TaskStatus } from '../types/task';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.error?.code ?? 'unknown', body?.error?.message ?? res.statusText);
  }

  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const projectsApi = {
  list: () => request<Project[]>('/projects'),
  create: (input: ProjectInput) => request<Project>('/projects', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: number, patch: Partial<ProjectInput>) =>
    request<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  remove: (id: number) => request<void>(`/projects/${id}`, { method: 'DELETE' }),
};

export const notesApi = {
  list: (projectId: number) => request<Note[]>(`/projects/${projectId}/notes`),
  create: (projectId: number, input: NoteInput) =>
    request<Note>(`/projects/${projectId}/notes`, { method: 'POST', body: JSON.stringify(input) }),
  update: (id: number, input: NoteInput) =>
    request<Note>(`/notes/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  remove: (id: number) => request<void>(`/notes/${id}`, { method: 'DELETE' }),
};

export const tasksApi = {
  create: (projectId: number, input: TaskInput) =>
    request<Task>(`/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify(input) }),
  update: (id: number, patch: TaskPatch) =>
    request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  /** `index` counts the other tasks in the target column. */
  move: (id: number, status: TaskStatus, index: number) =>
    request<Task>(`/tasks/${id}/move`, { method: 'POST', body: JSON.stringify({ status, index }) }),
  remove: (id: number) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),
};

export const boardApi = {
  get: (projectId: number) => request<{ columns: BoardColumn[]; tasks: Task[] }>(`/projects/${projectId}/board`),
  setWipLimit: (projectId: number, status: TaskStatus, wipLimit: number | null) =>
    request<BoardColumn>(`/projects/${projectId}/board/columns/${status}`, {
      method: 'PATCH',
      body: JSON.stringify({ wipLimit }),
    }),
};

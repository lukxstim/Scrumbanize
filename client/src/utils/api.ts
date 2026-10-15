import type { Note, NoteInput } from '../types/note';
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

export const notesApi = {
  list: () => request<Note[]>('/notes'),
  create: (input: NoteInput) => request<Note>('/notes', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: number, input: NoteInput) =>
    request<Note>(`/notes/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  remove: (id: number) => request<void>(`/notes/${id}`, { method: 'DELETE' }),
};

export const tasksApi = {
  list: () => request<Task[]>('/tasks'),
  create: (input: TaskInput) => request<Task>('/tasks', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: number, patch: TaskPatch) =>
    request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  /** `index` counts the other tasks in the target column. */
  move: (id: number, status: TaskStatus, index: number) =>
    request<Task>(`/tasks/${id}/move`, { method: 'POST', body: JSON.stringify({ status, index }) }),
  remove: (id: number) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),
};

export const boardApi = {
  get: () => request<{ columns: BoardColumn[]; tasks: Task[] }>('/board'),
  setWipLimit: (status: TaskStatus, wipLimit: number | null) =>
    request<BoardColumn>(`/board/columns/${status}`, { method: 'PATCH', body: JSON.stringify({ wipLimit }) }),
};

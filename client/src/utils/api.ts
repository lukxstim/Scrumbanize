import type { ActivityEntity, ActivityPage } from '../types/activity';
import type { Note, NoteInput } from '../types/note';
import type { Project, ProjectInput } from '../types/project';
import type { BoardColumn, Lane, Task, TaskInput, TaskPatch } from '../types/task';

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
  get: (id: number) => request<Note>(`/notes/${id}`),
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
  /** `index` counts the other tasks in the target cell (column × lane). */
  move: (id: number, columnId: number, laneId: number, index: number) =>
    request<Task>(`/tasks/${id}/move`, { method: 'POST', body: JSON.stringify({ columnId, laneId, index }) }),
  remove: (id: number) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),
};

export const boardApi = {
  get: (projectId: number) =>
    request<{ columns: BoardColumn[]; lanes: Lane[]; tasks: Task[] }>(`/projects/${projectId}/board`),
};

/** Deleting a column or lane that still has tasks needs `moveTasksTo`. */
const deleteQuery = (moveTasksTo?: number) => (moveTasksTo === undefined ? '' : `?moveTasksTo=${moveTasksTo}`);

export const columnsApi = {
  create: (projectId: number, input: { name: string; wipLimit?: number | null }) =>
    request<BoardColumn>(`/projects/${projectId}/columns`, { method: 'POST', body: JSON.stringify(input) }),
  update: (id: number, patch: { name?: string; wipLimit?: number | null }) =>
    request<BoardColumn>(`/columns/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  /** `index` counts the other columns. */
  move: (id: number, index: number) =>
    request<BoardColumn>(`/columns/${id}/move`, { method: 'POST', body: JSON.stringify({ index }) }),
  remove: (id: number, moveTasksTo?: number) =>
    request<void>(`/columns/${id}${deleteQuery(moveTasksTo)}`, { method: 'DELETE' }),
};

export const lanesApi = {
  create: (projectId: number, name: string) =>
    request<Lane>(`/projects/${projectId}/lanes`, { method: 'POST', body: JSON.stringify({ name }) }),
  rename: (id: number, name: string) => request<Lane>(`/lanes/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  /** `index` counts the other lanes. */
  move: (id: number, index: number) =>
    request<Lane>(`/lanes/${id}/move`, { method: 'POST', body: JSON.stringify({ index }) }),
  remove: (id: number, moveTasksTo?: number) =>
    request<void>(`/lanes/${id}${deleteQuery(moveTasksTo)}`, { method: 'DELETE' }),
};

export interface SearchResults {
  notes: { id: number; projectId: number; title: string; snippet: string }[];
  tasks: { id: number; projectId: number; title: string; columnName: string }[];
}

export const searchApi = {
  /** Notes and tasks of all projects; hits of `projectId` come first. */
  search: (query: string, projectId: number, signal?: AbortSignal) =>
    request<SearchResults>(`/search?q=${encodeURIComponent(query)}&project=${projectId}&limit=8`, { signal }),
};

export const activitiesApi = {
  /** Newest first; `before` is the `nextCursor` of the previous page. */
  list: (projectId: number, options: { type?: ActivityEntity; before?: number; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (options.type) params.set('type', options.type);
    if (options.before) params.set('before', String(options.before));
    if (options.limit) params.set('limit', String(options.limit));
    const query = params.toString();
    return request<ActivityPage>(`/projects/${projectId}/activities${query ? `?${query}` : ''}`);
  },
};

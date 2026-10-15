import type { ActivityEntity, ActivityPage } from '../types/activity';
import type { Note, NoteInput } from '../types/note';
import type { Project, ProjectInput } from '../types/project';
import type { BoardColumn, Lane, LinkKind, Task, TaskInput, TaskPatch } from '../types/task';
import type { EmptyResult, RestoreResult, TrashItem, TrashType } from '../types/trash';
import { notifyTrashChanged } from './appEvents';

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

/** Requests that put something into or take it out of the trash; the trash tab updates its count after them. */
async function trashRequest<T>(path: string, init: RequestInit): Promise<T> {
  const result = await request<T>(path, init);
  notifyTrashChanged();
  return result;
}

export const projectsApi = {
  list: () => request<Project[]>('/projects'),
  create: (input: ProjectInput) => request<Project>('/projects', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: number, patch: Partial<ProjectInput>) =>
    request<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  /** Moves the project to the trash. */
  remove: (id: number) => trashRequest<void>(`/projects/${id}`, { method: 'DELETE' }),
};

export const notesApi = {
  list: (projectId: number) => request<Note[]>(`/projects/${projectId}/notes`),
  get: (id: number) => request<Note>(`/notes/${id}`),
  create: (projectId: number, input: NoteInput) =>
    request<Note>(`/projects/${projectId}/notes`, { method: 'POST', body: JSON.stringify(input) }),
  update: (id: number, input: NoteInput) =>
    request<Note>(`/notes/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  /** Moves the note to the trash. */
  remove: (id: number) => trashRequest<void>(`/notes/${id}`, { method: 'DELETE' }),
};

export const tasksApi = {
  create: (projectId: number, input: TaskInput) =>
    request<Task>(`/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify(input) }),
  update: (id: number, patch: TaskPatch) =>
    request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  /** `index` counts the other tasks in the target cell (column × lane). */
  move: (id: number, columnId: number, laneId: number, index: number) =>
    request<Task>(`/tasks/${id}/move`, { method: 'POST', body: JSON.stringify({ columnId, laneId, index }) }),
  /** Moves the task to the trash. */
  remove: (id: number) => trashRequest<void>(`/tasks/${id}`, { method: 'DELETE' }),
  /** Both tasks come back, since a link shows on both. */
  addLink: (id: number, targetId: number, kind: LinkKind) =>
    request<{ task: Task; target: Task }>(`/tasks/${id}/links`, { method: 'POST', body: JSON.stringify({ targetId, kind }) }),
  removeLink: (id: number, linkId: number) =>
    request<{ task: Task; target: Task }>(`/tasks/${id}/links/${linkId}`, { method: 'DELETE' }),
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

const projectQuery = (projectId?: number) => (projectId === undefined ? '' : `?project=${projectId}`);

export const trashApi = {
  /** Notes and tasks of `projectId` (all projects if omitted) and all trashed projects, newest first. */
  list: (projectId?: number) => request<TrashItem[]>(`/trash${projectQuery(projectId)}`),
  restore: (type: TrashType, id: number) => trashRequest<RestoreResult>(`/trash/${type}/${id}/restore`, { method: 'POST' }),
  /** Deletes the item for good. */
  purge: (type: TrashType, id: number) => trashRequest<void>(`/trash/${type}/${id}`, { method: 'DELETE' }),
  /** Empties the trash of one project, or everything (trashed projects included). */
  empty: (projectId?: number) => trashRequest<EmptyResult>(`/trash${projectQuery(projectId)}`, { method: 'DELETE' }),
};

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

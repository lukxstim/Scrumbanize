import type { ActivityEntity, ActivityPage } from '../types/activity';
import type { AnalyticsQuery, AnalyticsReport } from '../types/analytics';
import type { GraphData } from '../types/graph';
import type { Attachment, AttachmentOwner } from '../types/attachment';
import type { AuthSession, AuthUser } from '../types/auth';
import type { Folder, Note, NoteColor, NoteInput } from '../types/note';
import type { Backlink, ContentRef, LinkCandidate, ResolvedLink } from '../types/link';
import type { Project, ProjectInput, ProjectMember, ProjectPatch, ProjectRole } from '../types/project';
import type { ProjectColor } from '../types/project';
import type { BoardColumn, Label, Lane, LinkKind, Task, TaskInput, TaskPatch } from '../types/task';
import type { Template, TemplateInput, TemplateKind } from '../types/template';
import type { EmptyResult, RestoreResult, TrashItem, TrashType } from '../types/trash';
import { notifyTrashChanged, notifyUnauthorized } from './appEvents';
import { clientId } from './realtime';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** The rest of the error, e.g. the current note or task with a conflict (409, US-24). */
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    // X-Client-Id: this tab skips the live announcement of its own change (US-24).
    headers: { 'Content-Type': 'application/json', 'X-Client-Id': clientId, ...init.headers },
  });

  if (!res.ok) {
    // Outside the login itself, a 401 means the session is over; the app shows the login.
    if (res.status === 401 && !path.startsWith('/auth/')) notifyUnauthorized();
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.error?.code ?? 'unknown', body?.error?.message ?? res.statusText, body?.error ?? {});
  }

  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Requests that put something into or take it out of the trash; the trash tab updates its count after them. */
async function trashRequest<T>(path: string, init: RequestInit): Promise<T> {
  const result = await request<T>(path, init);
  notifyTrashChanged();
  return result;
}

/** A request sent as another client of this tab (US-26), whose changes the tab then hears of live (US-24). */
const asClientHeaders = (asClient?: string): RequestInit => (asClient ? { headers: { 'X-Client-Id': asClient } } : {});

/** Login and the first administrator (US-21). */
export const authApi = {
  session: () => request<AuthSession>('/auth/session'),
  login: (email: string, password: string) =>
    request<{ user: AuthUser }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  setup: (input: { code: string; name: string; email: string; password: string }) =>
    request<{ user: AuthUser }>('/auth/setup', { method: 'POST', body: JSON.stringify(input) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  // One-time links (US-21c)
  invitation: (token: string) => request<{ email: string }>(`/auth/invitation/${encodeURIComponent(token)}`),
  register: (token: string, name: string, password: string) =>
    request<{ user: AuthUser }>('/auth/register', { method: 'POST', body: JSON.stringify({ token, name, password }) }),
  resetInfo: (token: string) => request<{ email: string; name: string }>(`/auth/reset/${encodeURIComponent(token)}`),
  reset: (token: string, password: string) => request<{ user: AuthUser }>('/auth/reset', { method: 'POST', body: JSON.stringify({ token, password }) }),
};

/** The user's own account (US-21c). */
export const accountApi = {
  update: (patch: { name?: string; avatarColor?: ProjectColor }) => request<{ user: AuthUser }>('/account', { method: 'PATCH', body: JSON.stringify(patch) }),
  changePassword: (current: string, password: string) =>
    request<void>('/account/password', { method: 'POST', body: JSON.stringify({ current, password }) }),
  /** A picture the browser already shrank (see utils/avatar.ts). */
  uploadAvatar: (picture: Blob) =>
    request<{ user: AuthUser }>('/account/avatar', { method: 'PUT', body: picture, headers: { 'Content-Type': picture.type || 'application/octet-stream' } }),
  removeAvatar: () => request<{ user: AuthUser }>('/account/avatar', { method: 'DELETE' }),
};

/** The calendar subscription (US-33): the token of a new link comes only with the answer that makes it. */
export const calendarFeedApi = {
  status: () => request<{ feed: { createdAt: string } | null }>('/account/calendar'),
  renew: () => request<{ token: string; createdAt: string }>('/account/calendar', { method: 'POST' }),
  revoke: () => request<void>('/account/calendar', { method: 'DELETE' }),
};

export interface Account extends AuthUser {
  disabled: boolean;
  createdAt: string;
  /** Projects only this account owns: it cannot be disabled before they have another owner. */
  soleOwnerOf: { id: number; name: string }[];
}

export interface Invitation {
  id: string;
  email: string;
  expiresAt: string;
  createdBy: string | null;
}

/** User management for administrators (US-21c). Links are made here and passed on by hand. */
export const adminApi = {
  users: () => request<Account[]>('/admin/users'),
  update: (id: number, patch: { systemRole?: 'admin' | 'user'; disabled?: boolean }) =>
    request<Account>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  handOver: (id: number, toUserId: number) =>
    request<{ projects: number }>(`/admin/users/${id}/hand-over`, { method: 'POST', body: JSON.stringify({ toUserId }) }),
  resetLink: (id: number) => request<{ token: string; expiresAt: string }>(`/admin/users/${id}/reset-link`, { method: 'POST' }),
  invitations: () => request<Invitation[]>('/admin/invitations'),
  invite: (email: string) =>
    request<{ token: string; email: string; expiresAt: string }>('/admin/invitations', { method: 'POST', body: JSON.stringify({ email }) }),
  revokeInvitation: (id: string) => request<void>(`/admin/invitations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

/** The members of a project and their roles (US-21). */
export const membersApi = {
  list: (projectId: number) => request<ProjectMember[]>(`/projects/${projectId}/members`),
  add: (projectId: number, email: string, role: ProjectRole) =>
    request<ProjectMember>(`/projects/${projectId}/members`, { method: 'POST', body: JSON.stringify({ email, role }) }),
  setRole: (projectId: number, userId: number, role: ProjectRole) =>
    request<ProjectMember>(`/projects/${projectId}/members/${userId}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  remove: (projectId: number, userId: number) => request<void>(`/projects/${projectId}/members/${userId}`, { method: 'DELETE' }),
};

/** Set when the app runs inside the desktop app. */
export interface DesktopInfo {
  version: string;
  /** Where new versions are published. */
  releasesUrl: string;
}

export const metaApi = {
  /** Facts about the installation; `sampleProjectId` is null if there is no sample project (any more). */
  /** `restoredAt`: when a backup was last restored (another window may still show the old data). */
  get: () => request<{ sampleProjectId: number | null; desktop: DesktopInfo | null; restoredAt: string | null }>('/meta'),
};

export const projectsApi = {
  list: () => request<Project[]>('/projects'),
  create: (input: ProjectInput) => request<Project>('/projects', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: number, patch: ProjectPatch) =>
    request<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  /** Moves the project to the trash. */
  remove: (id: number) => trashRequest<void>(`/projects/${id}`, { method: 'DELETE' }),
};

export const notesApi = {
  list: (projectId: number) => request<Note[]>(`/projects/${projectId}/notes`),
  /** "Alle Notizen" (US-22): the notes of every project and notebook the user can see. */
  listAll: () => request<Note[]>('/notes'),
  /** The tags of the project's notes, with how many notes use each. */
  tags: (projectId: number) => request<{ id: number; name: string; noteCount: number }[]>(`/projects/${projectId}/tags`),
  /** The same over all projects and notebooks the user can see (US-22). */
  allTags: () => request<{ id: number; name: string; noteCount: number }[]>('/tags'),
  get: (id: number) => request<Note>(`/notes/${id}`),
  /** `folderId`: right into a folder of the project (US-22). `asClient`: see `update`. */
  create: (projectId: number, input: NoteInput, folderId?: number | null, asClient?: string) =>
    request<Note>(`/projects/${projectId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ ...input, folderId: folderId ?? null }),
      ...asClientHeaders(asClient),
    }),
  /** The pages of a folder (null: the top level) in an order of their own (US-34); `ids` are all of its pages. */
  reorder: (projectId: number, folderId: number | null, ids: number[]) =>
    request<void>(`/projects/${projectId}/notes/order`, { method: 'PUT', body: JSON.stringify({ folderId, ids }) }),
  /** Into a folder of the note's project, or (null) to the top level; with `projectId`, of another notebook (US-34). */
  moveToFolder: (id: number, folderId: number | null, projectId?: number) =>
    request<Note>(`/notes/${id}/folder`, { method: 'PUT', body: JSON.stringify({ folderId, projectId }) }),
  /**
   * `baseUpdatedAt`: the version the edit started from; changed elsewhere since, the save is refused (409, US-24).
   * `asClient`: sent as another client of this tab, e.g. the quick notes window (US-26), so the tab hears of it.
   */
  update: (id: number, input: NoteInput, baseUpdatedAt?: string, asClient?: string) =>
    request<Note>(`/notes/${id}`, { method: 'PUT', body: JSON.stringify({ ...input, baseUpdatedAt }), ...asClientHeaders(asClient) }),
  /** A color of its own (US-26), or null for none; not a change of its text. `asClient`: see `update`. */
  setColor: (id: number, color: NoteColor | null, asClient?: string) =>
    request<Note>(`/notes/${id}/color`, { method: 'PUT', body: JSON.stringify({ color }), ...asClientHeaders(asClient) }),
  /** Moves the note to the trash. `asClient`: see `update`. */
  remove: (id: number, asClient?: string) => trashRequest<void>(`/notes/${id}`, { method: 'DELETE', ...asClientHeaders(asClient) }),
};

/** Links between notes and tasks across projects (US-22). */
export const linksApi = {
  resolve: (refs: ContentRef[]) => request<ResolvedLink[]>('/links/resolve', { method: 'POST', body: JSON.stringify({ refs }) }),
  candidates: (q: string, projectId: number, signal?: AbortSignal) =>
    request<LinkCandidate[]>(`/links/candidates?${new URLSearchParams({ q, project: String(projectId) })}`, { signal }),
  backlinks: (ref: ContentRef) => request<Backlink[]>(`/${ref.type}s/${ref.id}/backlinks`),
};

/** Folders of notes (US-22). */
export const foldersApi = {
  list: (projectId: number) => request<Folder[]>(`/projects/${projectId}/folders`),
  create: (projectId: number, name: string, parentId: number | null) =>
    request<Folder>(`/projects/${projectId}/folders`, { method: 'POST', body: JSON.stringify({ name, parentId }) }),
  /** Renames and/or moves the folder (into `parentId`, at `index` among its siblings). */
  update: (id: number, patch: { name?: string; parentId?: number | null; index?: number }) =>
    request<Folder>(`/folders/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  /** Its notes and subfolders move up one level. */
  remove: (id: number) => request<void>(`/folders/${id}`, { method: 'DELETE' }),
};

export const tasksApi = {
  get: (id: number) => request<Task>(`/tasks/${id}`),
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
    request<{ columns: BoardColumn[]; lanes: Lane[]; labels: Label[]; tasks: Task[] }>(`/projects/${projectId}/board`),
};

/** Deleting a column or lane that still has tasks needs `moveTasksTo`. */
const deleteQuery = (moveTasksTo?: number) => (moveTasksTo === undefined ? '' : `?moveTasksTo=${moveTasksTo}`);

export const columnsApi = {
  create: (projectId: number, input: { name: string; wipLimit?: number | null }) =>
    request<BoardColumn>(`/projects/${projectId}/columns`, { method: 'POST', body: JSON.stringify(input) }),
  update: (id: number, patch: { name?: string; wipLimit?: number | null; width?: number | null }) =>
    request<BoardColumn>(`/columns/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  /** Several widths at once, all or none; returns the project's columns. */
  setWidths: (projectId: number, widths: { id: number; width: number | null }[]) =>
    request<BoardColumn[]>(`/projects/${projectId}/column-widths`, { method: 'PUT', body: JSON.stringify({ widths }) }),
  /** `index` counts the other columns. */
  move: (id: number, index: number) =>
    request<BoardColumn>(`/columns/${id}/move`, { method: 'POST', body: JSON.stringify({ index }) }),
  remove: (id: number, moveTasksTo?: number) =>
    request<void>(`/columns/${id}${deleteQuery(moveTasksTo)}`, { method: 'DELETE' }),
};

export const labelsApi = {
  list: (projectId: number) => request<Label[]>(`/projects/${projectId}/labels`),
  create: (projectId: number, input: { name: string; color: ProjectColor }) =>
    request<Label>(`/projects/${projectId}/labels`, { method: 'POST', body: JSON.stringify(input) }),
  update: (id: number, patch: { name?: string; color?: ProjectColor }) =>
    request<Label>(`/labels/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  /** `index` counts the other labels. */
  move: (id: number, index: number) => request<Label>(`/labels/${id}/move`, { method: 'POST', body: JSON.stringify({ index }) }),
  /** How many tasks carry the label (for the confirmation before deleting). */
  usage: (id: number) => request<{ tasks: number }>(`/labels/${id}/usage`),
  remove: (id: number) => request<void>(`/labels/${id}`, { method: 'DELETE' }),
};

/** Templates of the project and those for all projects; changes are logged in `projectId`. */
export const templatesApi = {
  list: (projectId: number, kind?: TemplateKind) => request<Template[]>(`/projects/${projectId}/templates${kind ? `?kind=${kind}` : ''}`),
  create: (projectId: number, input: TemplateInput) =>
    request<Template>(`/projects/${projectId}/templates`, { method: 'POST', body: JSON.stringify(input) }),
  update: (projectId: number, id: number, patch: Partial<Omit<TemplateInput, 'kind'>>) =>
    request<Template>(`/projects/${projectId}/templates/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  remove: (projectId: number, id: number) => request<void>(`/projects/${projectId}/templates/${id}`, { method: 'DELETE' }),
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

export const attachmentsApi = {
  /**
   * Uploads files to a note or task; `onProgress` gets 0…1. Uses XMLHttpRequest, since fetch cannot report
   * upload progress. Rejects with an ApiError like the other calls.
   */
  upload(owner: AttachmentOwner, files: File[], onProgress?: (share: number) => void): Promise<Attachment[]> {
    const form = new FormData();
    for (const file of files) form.append('files', file, file.name);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/${owner.type === 'note' ? 'notes' : 'tasks'}/${owner.id}/attachments`);
      xhr.setRequestHeader('X-Client-Id', clientId);
      xhr.responseType = 'json';
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(event.loaded / event.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response as Attachment[]);
        else {
          const error = (xhr.response as { error?: { code?: string; message?: string } } | null)?.error;
          reject(new ApiError(xhr.status, error?.code ?? 'unknown', error?.message ?? xhr.statusText));
        }
      };
      xhr.onerror = () => reject(new ApiError(0, 'network', 'Network error'));
      xhr.send(form);
    });
  },
  /** Deletes the attachment and its file for good. */
  remove: (id: number) => request<void>(`/attachments/${id}`, { method: 'DELETE' }),
};

export const searchApi = {
  /** Notes and tasks of all projects; hits of `projectId` come first. Outside a project (e.g. /wissen) there is none. */
  search: (query: string, projectId: number | undefined, signal?: AbortSignal) =>
    request<SearchResults>(
      `/search?${new URLSearchParams({ q: query, ...(projectId === undefined ? {} : { project: String(projectId) }), limit: '8' })}`,
      { signal },
    ),
};

export const graphApi = {
  /** Notes and tasks of the project (without contents) and their connections. */
  get: (projectId: number) => request<GraphData>(`/projects/${projectId}/graph`),
};

export const analyticsApi = {
  /** Days and weeks are counted in the browser's time zone. */
  get: (projectId: number, query: AnalyticsQuery, signal?: AbortSignal) => {
    const params = new URLSearchParams({
      from: query.from,
      to: query.to,
      granularity: query.granularity,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    return request<AnalyticsReport>(`/projects/${projectId}/analytics?${params}`, { signal });
  },
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

export interface BackupCounts {
  projects: number;
  notes: number;
  tasks: number;
  attachments: number;
}

/** A checked backup waiting to be restored (see backupApi.prepareRestore). */
export interface PreparedRestore {
  token: string;
  /** Null for archives made by hand (database and uploads folder only). */
  manifest: { createdAt: string; schemaVersion: number } | null;
  counts: BackupCounts;
  /** Attachments whose file is not in the archive. */
  missingFiles: number;
}

/** The daily backups on a server (US-23); `schedule` is null where there are none (desktop app, BACKUP_TIME=off). */
export interface BackupStatus {
  schedule: { time: string; keep: number; timeZone: string } | null;
  folder: 'ok' | 'not_writable';
  last: { at: string; file: string | null; size: number | null } | null;
  /** The last failure, if it came after the last success. */
  error: { at: string; message: string } | null;
}

export const backupApi = {
  /** The whole instance as ZIP; the browser downloads it. */
  downloadUrl: '/api/backup',
  status: () => request<BackupStatus>('/backup/status'),
  /** Uploads and checks a backup; nothing is replaced yet. `onProgress` gets 0…1. */
  prepareRestore(file: File, onProgress?: (share: number) => void): Promise<PreparedRestore> {
    const form = new FormData();
    form.append('file', file, file.name);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/backup/restore');
      xhr.responseType = 'json';
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(event.loaded / event.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response as PreparedRestore);
        else {
          const error = (xhr.response as { error?: { code?: string; message?: string } } | null)?.error;
          reject(new ApiError(xhr.status, error?.code ?? 'unknown', error?.message ?? xhr.statusText));
        }
      };
      xhr.onerror = () => reject(new ApiError(0, 'network', 'Network error'));
      xhr.send(form);
    });
  },
  /** Replaces all data with the prepared backup (after a safety copy on the server). */
  restore: (token: string) =>
    // `keptAdmin`: the backup had no administrator, so the one restoring it was kept (US-21c).
    request<{ counts: BackupCounts; safetyCopy: string; keptAdmin: boolean }>(`/backup/restore/${encodeURIComponent(token)}`, { method: 'POST' }),
  cancelRestore: (token: string) => request<void>(`/backup/restore/${encodeURIComponent(token)}`, { method: 'DELETE' }),
};

export type ExportFormat = 'md' | 'html';

/** Addresses of downloads; the server names the files. */
export const exportUrls = {
  note: (noteId: number, format: ExportFormat) => `/api/notes/${noteId}/export?format=${format}`,
  projectNotes: (projectId: number, format: ExportFormat) => `/api/projects/${projectId}/export/notes?format=${format}`,
  boardCsv: (projectId: number) => `/api/projects/${projectId}/export/board.csv`,
};

export interface ImportedNoteInput {
  title: string;
  content: string;
  tags: string[];
  createdAt?: string;
}

export const importApi = {
  /** One batch (at most 50 notes); titles that exist get a number, e.g. "Plan (2)". */
  notes: (projectId: number, notes: ImportedNoteInput[]) =>
    request<{ created: { id: number; title: string }[] }>(`/projects/${projectId}/import/notes`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),
};

/** Starts a download of a server file (the desktop app asks where to save it). */
export function startDownload(url: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = '';
  document.body.append(link);
  link.click();
  link.remove();
}

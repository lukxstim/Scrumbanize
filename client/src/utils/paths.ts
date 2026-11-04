/** URLs of the app's pages; everything lives inside a project. */
export const paths = {
  notes: (projectId: number, noteId?: number) => `/p/${projectId}/notes${noteId === undefined ? '' : `/${noteId}`}`,
  /** The notes area as a graph of notes and tasks. */
  graph: (projectId: number) => `/p/${projectId}/graph`,
  board: (projectId: number) => `/p/${projectId}/board`,
  task: (projectId: number, taskId: number) => `/p/${projectId}/tasks/${taskId}`,
  calendar: (projectId: number) => `/p/${projectId}/calendar`,
  analytics: (projectId: number) => `/p/${projectId}/analytics`,
  trash: (projectId: number) => `/p/${projectId}/trash`,
  /** Settings of the whole installation; inside a project, so the header and its navigation stay. */
  settings: (projectId: number) => `/p/${projectId}/settings`,
};

/** Pages of the account (US-21c), outside the projects, so they work without any project, too. */
export const accountPaths = {
  profile: '/profil',
  users: '/benutzer',
};

/** The old "Alle Notizen" (US-22, removed with US-34); its links lead to the notebooks now. */
export const KNOWLEDGE_PATH = '/wissen';

/** The top-level pages of a project (the header tabs). */
export type Section = 'notes' | 'graph' | 'board' | 'calendar' | 'analytics' | 'trash' | 'settings';

/** The start page of a section, e.g. to keep the section when switching projects. */
export function sectionPath(projectId: number, section: Section): string {
  return paths[section](projectId);
}

/** The activity log is a drawer over the current page, open while the URL has `?activity=1`. */
export const ACTIVITY_PARAM = 'activity';

/** The current page with the activity drawer open. */
export function withActivityDrawer(pathname: string, search = ''): string {
  const params = new URLSearchParams(search);
  params.set(ACTIVITY_PARAM, '1');
  return `${pathname}?${params}`;
}

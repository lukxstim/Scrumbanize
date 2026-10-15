/** URLs of the app's pages; everything lives inside a project. */
export const paths = {
  notes: (projectId: number, noteId?: number) => `/p/${projectId}/notes${noteId === undefined ? '' : `/${noteId}`}`,
  board: (projectId: number) => `/p/${projectId}/board`,
  task: (projectId: number, taskId: number) => `/p/${projectId}/tasks/${taskId}`,
  calendar: (projectId: number) => `/p/${projectId}/calendar`,
  activity: (projectId: number) => `/p/${projectId}/activity`,
};

/** The top-level pages of a project (the header tabs). */
export type Section = 'notes' | 'board' | 'calendar' | 'activity';

/** The start page of a section, e.g. to keep the section when switching projects. */
export function sectionPath(projectId: number, section: Section): string {
  return paths[section](projectId);
}

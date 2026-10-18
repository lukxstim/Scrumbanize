import type { ProjectKind } from './project';

/** Mirrors server/src/repositories/contentLinksRepository.ts (US-22). */
export type ContentType = 'note' | 'task';

export interface ContentRef {
  type: ContentType;
  id: number;
}

/** Where a note or task lives. */
export interface ContentPlace {
  projectId: number;
  projectName: string;
  projectKind: ProjectKind;
}

/** A link target as the user may see it: "forbidden" also stands for "does not exist". */
export type ResolvedLink =
  | (ContentRef & ContentPlace & { status: 'ok'; title: string; done?: boolean })
  | (ContentRef & { status: 'trashed' })
  | (ContentRef & { status: 'forbidden' });

/** A note or task whose text links here. */
export interface Backlink extends ContentRef, ContentPlace {
  title: string;
}

/** A suggestion of the [[ picker. */
export interface LinkCandidate extends ContentRef, ContentPlace {
  title: string;
}

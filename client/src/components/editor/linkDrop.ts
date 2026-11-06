import type { ContentRef } from '../../types/link';

/** A note or task to put into the text as a link, e.g. a page dragged from the notebook tree (US-34). */
export interface DroppedLink {
  ref: ContentRef;
  title: string;
}

/** A point on the screen (client coordinates). */
export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Puts a link into the editor: in the formatted view where `at` points (else at the caret), in the Markdown view at
 * the caret. Set by the editor while it can be edited; see MarkdownEditor's `insertLinkRef`.
 */
export type InsertLink = (link: DroppedLink, at?: ScreenPoint) => void;

/** What the droppable around a note's editor carries: the note, and how to put a link into its text. */
export interface LinkDropTarget {
  noteId: number;
  insert: InsertLink;
}

/** Where the pointer was when a drag ended: where it started plus how far it moved. */
export function dropPoint(event: { activatorEvent: Event | object | null; delta: { x: number; y: number } }): ScreenPoint | undefined {
  const start = event.activatorEvent as Partial<MouseEvent & TouchEvent> | null;
  const touch = start?.touches?.[0] ?? start?.changedTouches?.[0];
  const origin =
    typeof start?.clientX === 'number' && typeof start.clientY === 'number'
      ? { x: start.clientX, y: start.clientY }
      : touch
        ? { x: touch.clientX, y: touch.clientY }
        : null;
  return origin ? { x: origin.x + event.delta.x, y: origin.y + event.delta.y } : undefined;
}

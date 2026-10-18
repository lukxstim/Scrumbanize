import type { ContentRef, ContentType, ResolvedLink } from '../types/link';
import { paths } from './paths';

/** `note:42` / `task:17`: a link to a note or task (US-22), in any project or notebook. */
export function parseContentHref(href: string | null | undefined): ContentRef | null {
  const match = /^(note|task):(\d+)$/.exec(href ?? '');
  return match ? { type: match[1] as ContentType, id: Number(match[2]) } : null;
}

export const contentHref = (ref: ContentRef) => `${ref.type}:${ref.id}`;
export const refKey = contentHref;

/** Link text escaped for Markdown: brackets and backslashes would end or break the link. */
export const escapeLinkText = (text: string) => text.replace(/[\\[\]]/g, (c) => `\\${c}`);

/** `[Titel](note:42)`; an empty title gets a stand-in, so the link stays clickable. */
export function linkMarkdown(ref: ContentRef, title: string): string {
  const text = title.trim() || (ref.type === 'note' ? 'Unbenannte Notiz' : `Task #${ref.id}`);
  return `[${escapeLinkText(text)}](${contentHref(ref)})`;
}

/** Where a visible link target opens. */
export function resolvedPath(link: Extract<ResolvedLink, { status: 'ok' }>): string {
  return link.type === 'note' ? paths.notes(link.projectId, link.id) : paths.task(link.projectId, link.id);
}

/** An open "[[" before the caret in plain text (the Markdown source view): where it starts and what follows it. */
export function findLinkTrigger(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(Math.max(0, caret - 80), caret);
  const match = /\[\[([^[\]\n]*)$/.exec(before);
  if (!match) return null;
  return { start: caret - match[0].length, query: match[1]! };
}

/** Replaces "[[query" with the link; returns the new text and where the caret goes (after the link). */
export function insertLinkAt(text: string, trigger: { start: number }, caret: number, ref: ContentRef, title: string) {
  const link = linkMarkdown(ref, title);
  return { text: text.slice(0, trigger.start) + link + text.slice(caret), caret: trigger.start + link.length };
}

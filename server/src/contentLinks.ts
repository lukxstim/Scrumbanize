/**
 * Links between notes and tasks inside Markdown (US-22): `[Text](note:42)` and `[Text](task:17)`. They work across
 * projects and notebooks. Code (fenced blocks and inline code) is left alone: a link written there is an example.
 */
export type ContentType = 'note' | 'task';

export interface ContentLinkRef {
  type: ContentType;
  id: number;
  /** The link text as written (Markdown, escapes included). */
  text: string;
}

// Code first, so that what it contains is skipped; then the link with its text (escaped brackets allowed).
const PATTERN = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)|\[((?:[^[\]\\\n]|\\.)*)\]\((note|task):(\d+)\)/g;

/** Rewrites every content link with `replace`; everything else stays as it is. */
export function replaceContentLinks(markdown: string, replace: (ref: ContentLinkRef) => string): string {
  return markdown.replace(PATTERN, (match, code: string | undefined, text: string, type: ContentType, id: string) =>
    code !== undefined ? match : replace({ type, id: Number(id), text }),
  );
}

/** The content links in `markdown`, in order (duplicates included). */
export function findContentLinks(markdown: string): ContentLinkRef[] {
  const refs: ContentLinkRef[] = [];
  replaceContentLinks(markdown, (ref) => {
    refs.push(ref);
    return '';
  });
  return refs;
}

/** The link text without Markdown escapes, e.g. for plain-text exports. */
export const unescapeLinkText = (text: string) => text.replace(/\\(.)/g, '$1');

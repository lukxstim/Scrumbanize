import { MarkdownManager } from '@tiptap/markdown';
import type { JSONContent } from '@tiptap/core';

const isWordChar = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}]/u.test(char);
const isSpace = (char: string | undefined) => char === undefined || /\s/.test(char);
const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/;

/**
 * Escapes text for Markdown only where a character would otherwise be read as syntax, so ordinary text stays
 * as typed: "Tom & Jerry", "a < b", "5 * 3", "snake_case" and "C:\Pfad" are kept, while "*kein Fett*" or
 * "&amp;" written as text are escaped. Tiptap's own escaping turns all of these into entities or backslash
 * escapes, which would show up in the Markdown source, in search and in snippets.
 */
export function escapeMarkdownText(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    const before = text[i - 1];
    const after = text[i + 1];
    switch (char) {
      case '\\':
        // Only a backslash in front of punctuation (or at the end, before what follows) acts as an escape.
        out += after === undefined || ASCII_PUNCTUATION.test(after) ? '\\\\' : '\\';
        break;
      case '*':
        // Surrounded by spaces it can neither open nor close emphasis ("5 * 3"); at the start it could be a list.
        out += i > 0 && isSpace(before) && isSpace(after) ? '*' : '\\*';
        break;
      case '_':
        // Inside a word, "_" never means emphasis ("snake_case").
        out += isWordChar(before) && isWordChar(after) ? '_' : '\\_';
        break;
      case '`':
      case '[':
      case ']':
      case '~':
        out += `\\${char}`;
        break;
      case '&':
        // Only where it would start an entity ("&amp;", "&#169;").
        out += /^&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i.test(text.slice(i)) ? '&amp;' : '&';
        break;
      case '<':
        // Only where it could start a tag, comment or autolink ("<div>", "<!--", "<https:…>").
        out += /[a-z/!?]/i.test(after ?? '') ? '&lt;' : '<';
        break;
      default:
        out += char;
    }
  }
  return out;
}

type Encoder = (this: { codeTypes: Set<string> }, text: string, node: JSONContent, parentNode?: JSONContent) => string;

// Replaces the private text encoder of the Markdown manager (Tiptap is pinned to an exact version for this).
// Text inside code stays untouched, as before.
(MarkdownManager.prototype as unknown as { encodeTextForMarkdown: Encoder }).encodeTextForMarkdown = function (text, node, parentNode) {
  const insideCode =
    (parentNode?.type != null && this.codeTypes.has(parentNode.type)) ||
    (node.marks ?? []).some((mark) => this.codeTypes.has(typeof mark === 'string' ? mark : mark.type));
  return insideCode ? text : escapeMarkdownText(text);
};

/**
 * A link whose text is its address is written as a bare URL, as typed (GFM turns it into a link again).
 * Marks are rendered around a placeholder, so the link's text arrives as `markText`. Addresses that would need
 * escaping or lose trailing punctuation keep the [text](url) form.
 */
export function renderLinkMarkdown(node: JSONContent, renderChildren: () => string, markText?: string): string {
  const href = String(node.attrs?.href ?? '');
  const title = String(node.attrs?.title ?? '');
  if (
    !title &&
    markText === href &&
    /^https?:\/\/\S+$/i.test(href) &&
    escapeMarkdownText(href) === href &&
    !/[?!.,:*_~)]$/.test(href)
  ) {
    return renderChildren();
  }
  const children = renderChildren();
  return title ? `[${children}](${href} "${title.replace(/"/g, '\\"')}")` : `[${children}](${href})`;
}

import { normalizeTag } from './tags';

/** Limits of one import (US-16). */
export const MAX_IMPORT_FILES = 5000;
export const MAX_IMPORT_BYTES = 500 * 1024 * 1024;
/** The server's limit for a note's content. */
export const MAX_NOTE_CONTENT = 1_000_000;
const MAX_TITLE = 200;
const MAX_TAGS = 50;

export interface ImportOptions {
  /** Folder names become tags ("Projekte/Kunde A/Notiz.md" → "projekte", "kunde a"). */
  folderTags: boolean;
  /** Obsidian-style #tags in the text become tags, too. */
  inlineTags: boolean;
}

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = { folderTags: true, inlineTags: true };

export interface ParsedNote {
  /** Path inside the import, for the preview and messages. */
  path: string;
  title: string;
  content: string;
  tags: string[];
  createdAt?: string;
}

export interface SkippedFile {
  path: string;
  reason: string;
}

const isMarkdown = (path: string) => /\.(md|markdown|mdown|mkd)$/i.test(path);

/** Files nobody wants imported: app folders (.obsidian, .trash), system files. They are not even listed. */
export function isIgnored(path: string): boolean {
  return path.split('/').some((part) => part.startsWith('.') || part === '__MACOSX' || part === 'Thumbs.db' || part === 'desktop.ini');
}

/** Sorts the chosen files into Markdown to import and everything else, which is listed as skipped. */
export function classifyFiles<T extends { path: string }>(files: T[]): { markdown: T[]; skipped: SkippedFile[] } {
  const markdown: T[] = [];
  const skipped: SkippedFile[] = [];
  for (const file of files) {
    if (isIgnored(file.path)) continue;
    if (isMarkdown(file.path)) markdown.push(file);
    else skipped.push({ path: file.path, reason: 'Kein Markdown (Bilder und Anhänge werden noch nicht importiert)' });
  }
  return { markdown, skipped };
}

/** The top folder all paths share (the vault or export folder inside a ZIP), which is no tag; undefined if none. */
export function commonRootFolder(paths: string[]): string | undefined {
  const first = paths[0]?.split('/');
  if (!first || first.length < 2) return undefined;
  return paths.every((path) => path.startsWith(`${first[0]}/`)) ? first[0] : undefined;
}

// ---- front matter ----

/** The value of a simple YAML scalar: quotes removed. */
function scalar(raw: string): string {
  const value = raw.trim();
  if (/^".*"$/.test(value)) {
    try {
      return JSON.parse(value) as string;
    } catch {
      return value.slice(1, -1);
    }
  }
  if (/^'.*'$/.test(value)) return value.slice(1, -1).replace(/''/g, "'");
  return value;
}

/**
 * The front matter Obsidian, Notion exports and others write: `key: value`, `key: [a, b]` and `key:` followed by
 * `- item` lines. Enough for title, tags and dates; anything fancier is ignored.
 */
export function parseFrontMatter(text: string): { data: Record<string, string | string[]>; body: string } {
  const match = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(text);
  if (!match) return { data: {}, body: text.replace(/^﻿/, '') };
  const data: Record<string, string | string[]> = {};
  let listKey: string | null = null;
  for (const line of match[1]!.split(/\r?\n/)) {
    const item = /^\s+-\s+(.*)$/.exec(line) ?? (listKey ? /^-\s+(.*)$/.exec(line) : null);
    if (item && listKey) {
      const list = data[listKey];
      data[listKey] = [...(Array.isArray(list) ? list : []), scalar(item[1]!)];
      continue;
    }
    const pair = /^([A-Za-z_][\w -]*):\s*(.*)$/.exec(line);
    if (!pair) continue;
    const key = pair[1]!.trim().toLowerCase();
    const value = pair[2]!.trim();
    listKey = null;
    if (value === '') {
      listKey = key;
      data[key] = [];
    } else if (/^\[.*\]$/.test(value)) {
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map(scalar)
        .filter(Boolean);
    } else {
      data[key] = scalar(value);
    }
  }
  return { data, body: text.slice(match[0].length) };
}

const asList = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : value.split(/[,\s]+/).filter(Boolean);

/** A date from front matter as ISO time; a plain date means midnight where the import runs. */
export function parseDate(value: string | string[] | undefined): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const text = value.trim();
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const date = plain ? new Date(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3])) : new Date(text.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) || date.getFullYear() < 1970 ? undefined : date.toISOString();
}

// ---- the note ----

/** The file name without folder, extension and the 32-character id Notion appends ("Plan 3f2a…c9.md"). */
export function titleFromPath(path: string): string {
  const name = path.split('/').pop()!.replace(/\.[^.]+$/, '');
  return name.replace(/\s+[0-9a-f]{32}$/i, '').trim();
}

/** Obsidian links: [[Note]] and [[Note|text]] become their text, embedded files a short hint (no note links here). */
function convertWikiLinks(text: string): string {
  return text
    .replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (_m, target: string) => `[Anhang: ${target.trim()}]`)
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_m, _target, label: string) => label.trim())
    .replace(/\[\[([^\]]+)\]\]/g, (_m, target: string) => target.split('#')[0]!.trim() || target.trim());
}

/** #tags outside code; headings ("# Titel") have a space after the hash and are not tags. */
function inlineTags(text: string): string[] {
  const withoutCode = text.replace(/^(```|~~~)[\s\S]*?^\1/gm, '').replace(/`[^`\n]*`/g, '');
  return [...withoutCode.matchAll(/(?:^|[\s(])#([\p{L}\p{N}_][\p{L}\p{N}_\-/]*)/gu)].map((m) => m[1]!).filter((tag) => !/^\d+$/.test(tag));
}

/**
 * One Markdown file as a note. Title: front matter `title`, else a first-line `# Heading` (taken out of the text),
 * else the file name. `rootFolder` is the folder the user picked, which is no tag itself.
 */
export function parseMarkdownNote(path: string, text: string, options: ImportOptions, rootFolder?: string): ParsedNote {
  const { data, body } = parseFrontMatter(text);
  let content = body.replace(/\r\n/g, '\n');

  let title = typeof data.title === 'string' ? data.title.trim() : '';
  if (!title) {
    const heading = /^\s*#\s+(.+?)\s*#*\s*(?:\n|$)/.exec(content);
    if (heading) {
      title = heading[1]!;
      content = content.slice(heading[0].length);
    }
  }
  title = (title || titleFromPath(path) || 'Importierte Notiz').slice(0, MAX_TITLE).trim();
  content = convertWikiLinks(content).replace(/^\n+/, '').trimEnd();

  const folders = path.split('/').slice(0, -1);
  if (rootFolder && folders[0] === rootFolder) folders.shift();
  const tags = [
    ...asList(data.tags ?? data.tag),
    ...(options.folderTags ? folders : []),
    ...(options.inlineTags ? inlineTags(content) : []),
  ]
    .map((tag) => normalizeTag(tag.replace(/^#/, '')))
    .filter(Boolean);

  const createdAt = parseDate(data.created ?? data.date ?? data.created_at ?? data['creation date'] ?? data.createdat);
  return { path, title, content, tags: [...new Set(tags)].slice(0, MAX_TAGS), ...(createdAt ? { createdAt } : {}) };
}

/**
 * Splits notes into requests the server accepts: at most `maxNotes` per batch and about `maxBytes` of text
 * (its JSON body limit is 2 MB).
 */
export function batchNotes<T extends { content: string; title: string }>(notes: T[], maxNotes = 50, maxBytes = 1_500_000): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let bytes = 0;
  for (const note of notes) {
    const size = (note.content.length + note.title.length) * 2;
    if (current.length > 0 && (current.length >= maxNotes || bytes + size > maxBytes)) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(note);
    bytes += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** Notes as Markdown or HTML files and the board as CSV (US-16). Pure functions; the routes add the HTTP part. */
import { Marked, type Tokens } from 'marked';
import type { Task } from './repositories/tasksRepository.js';
import type { TaskPriority } from './validation.js';

export interface ExportNote {
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  /** Files exported next to the note (notes export): listed at the end, linked by relative path. */
  files?: { name: string; href: string }[];
}

export const UNTITLED_NOTE = 'Unbenannte Notiz';

/** A file name from a title: without characters file systems reject, at most 80 characters. */
export function safeFileName(title: string, fallback = UNTITLED_NOTE): string {
  const name = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 80)
    .trim();
  return name || fallback;
}

/** Makes names unique within one archive (case-insensitive, like Windows and macOS): "Plan", "Plan (2)", … */
export function uniqueNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    let candidate = name;
    for (let n = 2; used.has(candidate.toLocaleLowerCase('de')); n++) candidate = `${name} (${n})`;
    used.add(candidate.toLocaleLowerCase('de'));
    return candidate;
  });
}

const yamlString = (value: string) => JSON.stringify(value);

/** The note as Markdown with front matter (title, tags, dates), readable by Obsidian and the import of this app. */
export function noteToMarkdown(note: ExportNote): string {
  const title = note.title.trim() || UNTITLED_NOTE;
  const frontMatter = [
    '---',
    `title: ${yamlString(title)}`,
    ...(note.tags.length ? ['tags:', ...note.tags.map((tag) => `  - ${yamlString(tag)}`)] : []),
    `created: ${note.createdAt}`,
    `updated: ${note.updatedAt}`,
    '---',
  ];
  const body = note.content.trim();
  const files = note.files?.length ? `\n## Anhänge\n\n${note.files.map((f) => `- [${f.name}](<${f.href}>)`).join('\n')}\n` : '';
  return `${frontMatter.join('\n')}\n\n# ${title}\n${body ? `\n${body}\n` : ''}${files}`;
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// An own instance with a renderer that lets through only what the editor itself produces: raw HTML is escaped
// except highlights (<mark>), and links only keep web and mail addresses.
const htmlMarked = new Marked({
  gfm: true,
  renderer: {
    html({ text }: Tokens.HTML | Tokens.Tag) {
      const mark = /^<(\/?)mark\b[^>]*>$/i.exec(text.trim());
      return mark ? `<${mark[1]}mark>` : escapeHtml(text);
    },
    link({ href, tokens }: Tokens.Link) {
      const text = this.parser.parseInline(tokens);
      return /^(https?:|mailto:)/i.test(href) ? `<a href="${escapeHtml(href)}">${text}</a>` : text;
    },
    image({ text }: Tokens.Image) {
      return escapeHtml(text);
    },
  },
});

const dateTime = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' });

/** A standalone, printable HTML page (black on white, no scripts, no external files). */
export function noteToHtml(note: ExportNote): string {
  const title = note.title.trim() || UNTITLED_NOTE;
  const body = htmlMarked.parse(note.content, { async: false });
  const tags = note.tags.length ? `<p class="tags">${note.tags.map((t) => `#${escapeHtml(t)}`).join(' ')}</p>` : '';
  const files = note.files?.length
    ? `<h2>Anhänge</h2>\n<ul>${note.files.map((f) => `<li><a href="${escapeHtml(encodeURI(f.href))}">${escapeHtml(f.name)}</a></li>`).join('')}</ul>`
    : '';
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { margin: 0 auto; max-width: 46rem; padding: 2.5rem 1.5rem; color: #111; background: #fff;
         font: 16px/1.6 system-ui, -apple-system, 'Segoe UI', sans-serif; }
  h1, h2, h3, h4 { line-height: 1.25; margin: 1.6em 0 0.5em; }
  h1.title { margin-top: 0; }
  .meta { color: #555; font-size: 0.85rem; margin: 0 0 2rem; }
  .tags { color: #555; font-size: 0.85rem; margin: 0.25rem 0 0; }
  a { color: #1a4fb5; }
  code { font: 0.9em ui-monospace, SFMono-Regular, Consolas, monospace; background: #f2f2f2; padding: 0.1em 0.3em; border-radius: 3px; }
  pre { background: #f5f5f5; padding: 0.8rem 1rem; overflow-x: auto; border-radius: 4px; }
  pre code { background: none; padding: 0; }
  blockquote { margin: 1em 0; padding-left: 1em; border-left: 3px solid #ccc; color: #444; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 0.3em 0.6em; text-align: left; }
  mark { background: #fff1a8; color: inherit; }
  li input[type=checkbox] { margin-right: 0.4em; }
  @media print { body { padding: 0; max-width: none; } a { color: inherit; } }
</style>
</head>
<body>
<h1 class="title">${escapeHtml(title)}</h1>
<p class="meta">Erstellt ${dateTime.format(new Date(note.createdAt))} · zuletzt geändert ${dateTime.format(new Date(note.updatedAt))}</p>
${tags}
${body}
${files}
</body>
</html>
`;
}

// ---- board as CSV ----

const PRIORITY_LABELS: Record<TaskPriority, string> = { low: 'Niedrig', medium: 'Mittel', high: 'Hoch', urgent: 'Dringend' };

/** "17.10.2026" for a calendar date (YYYY-MM-DD) or an ISO time (as seen in Germany). */
export function germanDate(value: string | null): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-');
    return `${d}.${m}.${y}`;
  }
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' }).format(new Date(value));
}

/** One field: quoted when it contains the separator, quotes or line breaks (RFC 4180). */
function csvField(value: string | number): string {
  const text = String(value);
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const CSV_COLUMNS = [
  'ID',
  'Titel',
  'Spalte',
  'Lane',
  'Erledigt',
  'Priorität',
  'Labels',
  'Start',
  'Fällig',
  'Erstellt',
  'Aktualisiert',
  'Quell-Notiz',
  'Blockiert von',
  'Blockiert',
  'Hängt zusammen mit',
  'Anhänge',
  'Beschreibung',
];

/**
 * The tasks as CSV for German Excel: semicolons, dates as TT.MM.JJJJ, UTF-8 with byte order mark (so Excel reads
 * umlauts), CRLF line ends. Tasks in board order.
 */
export function boardToCsv(
  tasks: Task[],
  columns: { id: number; name: string }[],
  lanes: { id: number; name: string }[],
): string {
  const columnName = new Map(columns.map((c) => [c.id, c.name]));
  const laneName = new Map(lanes.map((l) => [l.id, l.name]));
  const done = columns.at(-1)?.id;
  const links = (task: Task, kind: string) =>
    task.links
      .filter((l) => l.kind === kind)
      .map((l) => `#${l.task.id} ${l.task.title}`)
      .join(', ');
  const rows = tasks.map((task) => [
    task.id,
    task.title,
    columnName.get(task.columnId) ?? '',
    laneName.get(task.laneId) ?? '',
    task.columnId === done ? 'ja' : 'nein',
    task.priority ? PRIORITY_LABELS[task.priority] : '',
    task.labels.map((l) => l.name).join(', '),
    germanDate(task.startDate),
    germanDate(task.dueDate),
    germanDate(task.createdAt),
    germanDate(task.updatedAt),
    task.sourceNote?.title ?? '',
    links(task, 'blocked_by'),
    links(task, 'blocks'),
    links(task, 'relates'),
    task.attachments.map((a) => a.fileName).join(', '),
    task.description,
  ]);
  return `\uFEFF${[CSV_COLUMNS, ...rows].map((row) => row.map(csvField).join(';')).join('\r\n')}\r\n`;
}

/** A Content-Disposition header that works for any title (ASCII fallback plus the UTF-8 name, RFC 6266). */
export function attachmentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

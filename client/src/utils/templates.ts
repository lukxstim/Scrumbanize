import type { BoardColumn, Label, Lane, TaskInput } from '../types/task';
import type { NoteTemplate, TaskTemplate, Template } from '../types/template';
import { isoWeek, toDateString } from './analytics';
import { findByName, matchLabels } from './labels';

export interface PlaceholderContext {
  now: Date;
  projectName: string;
}

/** The placeholders templates understand, with an example for the help text. */
export const PLACEHOLDERS: { key: string; example: string }[] = [
  { key: '{{datum}}', example: '17.10.2026' },
  { key: '{{wochentag}}', example: 'Samstag' },
  { key: '{{uhrzeit}}', example: '14:30' },
  { key: '{{kw}}', example: '42' },
  { key: '{{projekt}}', example: 'Projektname' },
];

const pad = (n: number) => String(n).padStart(2, '0');

/** Replaces {{datum}}, {{wochentag}}, {{uhrzeit}}, {{kw}} and {{projekt}} (any case, spaces allowed); others stay. */
export function fillPlaceholders(text: string, { now, projectName }: PlaceholderContext): string {
  const values: Record<string, string> = {
    datum: `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`,
    wochentag: now.toLocaleDateString('de-DE', { weekday: 'long' }),
    uhrzeit: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    kw: String(isoWeek(toDateString(now))),
    projekt: projectName,
  };
  return text.replace(/\{\{\s*([a-zA-ZäöüÄÖÜ]+)\s*\}\}/g, (match, key: string) => values[key.toLowerCase()] ?? match);
}

/** A new note from a template; an empty title falls back to the template's name. */
export function noteFromTemplate(template: NoteTemplate, context: PlaceholderContext) {
  return {
    title: fillPlaceholders(template.title, context).trim() || template.name,
    content: fillPlaceholders(template.content, context),
    tags: template.defaults.tags,
  };
}

export interface TaskTemplateResult {
  input: TaskInput;
  /** Labels, column or lane the template names but the project does not have (they are left out). */
  missing: string[];
}

/**
 * A new task from a template in this project: labels, column and lane matched by name, the due date counted from
 * today. `title` (typed by the user) wins over the template's; `laneId` is used when the template names no lane.
 */
export function taskFromTemplate(
  template: TaskTemplate,
  board: { labels: Label[]; columns: BoardColumn[]; lanes: Lane[] },
  context: PlaceholderContext & { title?: string; laneId?: number },
): TaskTemplateResult {
  const { defaults } = template;
  const labels = matchLabels(defaults.labels, board.labels);
  const column = findByName(board.columns, defaults.column);
  const lane = findByName(board.lanes, defaults.lane);
  const missing = [
    ...labels.missing.map((name) => `Label „${name}“`),
    ...(defaults.column && !column ? [`Spalte „${defaults.column}“`] : []),
    ...(defaults.lane && !lane ? [`Swimlane „${defaults.lane}“`] : []),
  ];
  let dueDate: string | undefined;
  if (defaults.dueInDays !== null) {
    const due = new Date(context.now);
    due.setDate(due.getDate() + defaults.dueInDays);
    dueDate = toDateString(due);
  }
  const title = context.title?.trim() || fillPlaceholders(template.title, context).trim() || template.name;
  return {
    input: {
      title,
      description: fillPlaceholders(template.content, context),
      priority: defaults.priority,
      ...(labels.found.length ? { labelIds: labels.found.map((l) => l.id) } : {}),
      ...(column ? { columnId: column.id } : {}),
      ...(lane ? { laneId: lane.id } : context.laneId !== undefined ? { laneId: context.laneId } : {}),
      ...(dueDate ? { dueDate } : {}),
    },
    missing,
  };
}

/** The project's own templates first, then those for all projects; by name within each. */
export function sortTemplates<T extends Template>(templates: T[]): T[] {
  return [...templates].sort(
    (a, b) => (a.scope === b.scope ? 0 : a.scope === 'project' ? -1 : 1) || a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }),
  );
}

/** "+7 Tage", "am selben Tag" for a relative due date. */
export function dueInDaysLabel(days: number | null): string {
  if (days === null) return 'keine';
  if (days === 0) return 'am selben Tag';
  return days === 1 ? '+1 Tag' : `+${days} Tage`;
}

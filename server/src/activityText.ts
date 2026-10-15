/** German descriptions for activity log entries. Stored with the entry, so they survive renames and deletes. */

export const UNTITLED_NOTE = 'Unbenannte Notiz';

const quote = (text: string) => `„${text}“`;
const noteName = (title: string) => quote(title.trim() || UNTITLED_NOTE);

export type EditField = 'title' | 'content' | 'description' | 'priority' | 'startDate' | 'dueDate';
/** Fields whose new value is shown in the description ("Priorität: Hoch"). */
export type ValueField = 'priority' | 'startDate' | 'dueDate';

/** "Titel", "Inhalt", "Tags +q4 −alt", "Fällig: 17.10.2026" for the changes of an aggregated edit. */
export interface EditSummary {
  fields: EditField[];
  tagsAdded: string[];
  tagsRemoved: string[];
  /** The latest value of changed value fields, already formatted ("Hoch", "17.10.2026", "entfernt"). */
  values?: Partial<Record<ValueField, string>>;
}

const FIELD_LABELS: Record<EditField, string> = {
  title: 'Titel',
  content: 'Inhalt',
  description: 'Beschreibung',
  priority: 'Priorität',
  startDate: 'Start',
  dueDate: 'Fällig',
};

export const PRIORITY_LABELS = { low: 'Niedrig', medium: 'Mittel', high: 'Hoch', urgent: 'Dringend' } as const;

/** "2026-10-17" → "17.10.2026"; null → "entfernt". */
export function formatDateValue(date: string | null): string {
  if (!date) return 'entfernt';
  const [year, month, day] = date.split('-');
  return `${day}.${month}.${year}`;
}

export function formatPriorityValue(priority: keyof typeof PRIORITY_LABELS | null): string {
  return priority ? PRIORITY_LABELS[priority] : 'keine';
}

export function describeChanges(changes: EditSummary): string {
  const parts: string[] = changes.fields.map((field) => {
    const value = changes.values?.[field as ValueField];
    return value === undefined ? FIELD_LABELS[field] : `${FIELD_LABELS[field]}: ${value}`;
  });
  const tagParts = [...changes.tagsAdded.map((t) => `+${t}`), ...changes.tagsRemoved.map((t) => `−${t}`)];
  if (tagParts.length > 0) parts.push(`Tags ${tagParts.join(' ')}`);
  return parts.join(', ');
}

export const text = {
  noteCreated: (title: string) => `Notiz ${noteName(title)} erstellt`,
  noteUpdated: (title: string, changes: EditSummary) => {
    const details = describeChanges(changes);
    return `Notiz ${noteName(title)} bearbeitet${details ? ` (${details})` : ''}`;
  },
  noteDeleted: (title: string) => `Notiz ${noteName(title)} gelöscht`,

  taskCreated: (title: string, column: string, sourceNote?: string) =>
    sourceNote === undefined
      ? `Task ${quote(title)} in ${quote(column)} erstellt`
      : `Task ${quote(title)} aus Notiz ${noteName(sourceNote)} erstellt`,
  taskUpdated: (title: string, changes: EditSummary) => {
    const details = describeChanges(changes);
    return `Task ${quote(title)} bearbeitet${details ? ` (${details})` : ''}`;
  },
  taskMoved: (title: string, from: { column: string; lane: string }, to: { column: string; lane: string }) => {
    const parts: string[] = [];
    if (from.column !== to.column) parts.push(`von ${quote(from.column)} nach ${quote(to.column)}`);
    if (from.lane !== to.lane) parts.push(`in Swimlane ${quote(to.lane)}`);
    return `Task ${quote(title)} ${parts.join(' ')} verschoben`;
  },
  taskDeleted: (title: string) => `Task ${quote(title)} gelöscht`,

  itemCreated: (kind: BoardKind, name: string) => `${KIND_LABELS[kind]} ${quote(name)} angelegt`,
  itemRenamed: (kind: BoardKind, from: string, to: string) => `${KIND_LABELS[kind]} ${quote(from)} in ${quote(to)} umbenannt`,
  itemMoved: (kind: BoardKind, name: string, position: number) =>
    `${KIND_LABELS[kind]} ${quote(name)} an Position ${position} verschoben`,
  itemDeleted: (kind: BoardKind, name: string, movedTasks: number, target?: string) =>
    `${KIND_LABELS[kind]} ${quote(name)} gelöscht` +
    (movedTasks > 0 && target ? `, ${movedTasks === 1 ? '1 Task' : `${movedTasks} Tasks`} nach ${quote(target)} verschoben` : ''),
  wipLimitChanged: (column: string, limit: number | null) =>
    limit === null ? `WIP-Limit von ${quote(column)} entfernt` : `WIP-Limit von ${quote(column)} auf ${limit} gesetzt`,

  projectCreated: (name: string) => `Projekt ${quote(name)} angelegt`,
  projectRenamed: (from: string, to: string) => `Projekt ${quote(from)} in ${quote(to)} umbenannt`,
  projectRecolored: (name: string) => `Farbe von Projekt ${quote(name)} geändert`,
};

export type BoardKind = 'column' | 'lane';
const KIND_LABELS: Record<BoardKind, string> = { column: 'Spalte', lane: 'Swimlane' };

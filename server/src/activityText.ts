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
  /** Task labels, by name. */
  labelsAdded?: string[];
  labelsRemoved?: string[];
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
  const labelParts = [...(changes.labelsAdded ?? []).map((l) => `+${l}`), ...(changes.labelsRemoved ?? []).map((l) => `−${l}`)];
  if (labelParts.length > 0) parts.push(`Labels ${labelParts.join(' ')}`);
  return parts.join(', ');
}

/** Project roles as the app names them (US-21). */
const ROLE_NAMES: Record<string, string> = { owner: 'Owner', member: 'Mitglied', viewer: 'Betrachter' };

export const text = {
  noteCreated: (title: string) => `Notiz ${noteName(title)} erstellt`,
  noteUpdated: (title: string, changes: EditSummary) => {
    const details = describeChanges(changes);
    return `Notiz ${noteName(title)} bearbeitet${details ? ` (${details})` : ''}`;
  },
  noteDeleted: (title: string) => `Notiz ${noteName(title)} gelöscht`,
  filesAttached: (owner: 'note' | 'task', title: string, fileNames: string[]) =>
    `${fileNames.length === 1 ? `Datei ${quote(fileNames[0]!)}` : `${fileNames.length} Dateien`} an ${
      owner === 'note' ? `Notiz ${noteName(title)}` : `Task ${quote(title)}`
    } angehängt`,
  fileRemoved: (owner: 'note' | 'task', title: string, fileName: string) =>
    `Datei ${quote(fileName)} von ${owner === 'note' ? `Notiz ${noteName(title)}` : `Task ${quote(title)}`} entfernt`,
  noteTrashed: (title: string) => `Notiz ${noteName(title)} in den Papierkorb verschoben`,
  noteRestored: (title: string) => `Notiz ${noteName(title)} wiederhergestellt`,
  notePurged: (title: string) => `Notiz ${noteName(title)} endgültig gelöscht`,

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
  taskLinked: (title: string, kind: LinkKind, other: string) =>
    kind === 'blocks'
      ? `Task ${quote(title)} blockiert jetzt ${quote(other)}`
      : kind === 'blocked_by'
        ? `Task ${quote(title)} wird jetzt von ${quote(other)} blockiert`
        : `Task ${quote(title)} mit ${quote(other)} verknüpft`,
  taskUnlinked: (title: string, other: string) => `Verknüpfung von ${quote(title)} mit ${quote(other)} entfernt`,
  taskTrashed: (title: string) => `Task ${quote(title)} in den Papierkorb verschoben`,
  taskRestored: (title: string, column: string) => `Task ${quote(title)} wiederhergestellt (in ${quote(column)})`,
  taskPurged: (title: string) => `Task ${quote(title)} endgültig gelöscht`,
  trashEmptied: (notes: number, tasks: number) =>
    `Papierkorb geleert (${[
      notes > 0 ? (notes === 1 ? '1 Notiz' : `${notes} Notizen`) : '',
      tasks > 0 ? (tasks === 1 ? '1 Task' : `${tasks} Tasks`) : '',
    ]
      .filter(Boolean)
      .join(', ')})`,

  itemCreated: (kind: BoardKind, name: string) => `${KIND_LABELS[kind]} ${quote(name)} angelegt`,
  itemRenamed: (kind: BoardKind, from: string, to: string) => `${KIND_LABELS[kind]} ${quote(from)} in ${quote(to)} umbenannt`,
  itemMoved: (kind: BoardKind, name: string, position: number) =>
    `${KIND_LABELS[kind]} ${quote(name)} an Position ${position} verschoben`,
  itemDeleted: (kind: BoardKind, name: string, movedTasks: number, target?: string) =>
    `${KIND_LABELS[kind]} ${quote(name)} gelöscht` +
    (movedTasks > 0 && target ? `, ${movedTasks === 1 ? '1 Task' : `${movedTasks} Tasks`} nach ${quote(target)} verschoben` : ''),
  wipLimitChanged: (column: string, limit: number | null) =>
    limit === null ? `WIP-Limit von ${quote(column)} entfernt` : `WIP-Limit von ${quote(column)} auf ${limit} gesetzt`,

  labelRecolored: (name: string) => `Farbe von Label ${quote(name)} geändert`,
  labelDeleted: (name: string, tasks: number) =>
    `Label ${quote(name)} gelöscht${tasks > 0 ? ` (von ${tasks === 1 ? '1 Task' : `${tasks} Tasks`} entfernt)` : ''}`,

  templateCreated: (kind: TemplateKind, name: string, global: boolean) =>
    `${TEMPLATE_LABELS[kind]} ${quote(name)} angelegt${global ? ' (für alle Projekte)' : ''}`,
  templateRenamed: (kind: TemplateKind, from: string, to: string) => `${TEMPLATE_LABELS[kind]} ${quote(from)} in ${quote(to)} umbenannt`,
  templateUpdated: (kind: TemplateKind, name: string) => `${TEMPLATE_LABELS[kind]} ${quote(name)} bearbeitet`,
  templateDeleted: (kind: TemplateKind, name: string) => `${TEMPLATE_LABELS[kind]} ${quote(name)} gelöscht`,

  projectCreated: (name: string) => `Projekt ${quote(name)} angelegt`,
  memberAdded: (name: string, role: string) => `${name} als ${ROLE_NAMES[role] ?? role} hinzugefügt`,
  memberRoleChanged: (name: string, role: string) => `Rolle von ${name} auf ${ROLE_NAMES[role] ?? role} geändert`,
  memberRemoved: (name: string) => `${name} aus dem Projekt entfernt`,
  memberLeft: (name: string) => `${name} hat das Projekt verlassen`,
  sampleProjectCreated: () => 'Beispielprojekt angelegt',
  notesImported: (count: number) => `${count === 1 ? '1 Notiz' : `${count} Notizen`} importiert`,
  projectRenamed: (from: string, to: string) => `Projekt ${quote(from)} in ${quote(to)} umbenannt`,
  projectRecolored: (name: string) => `Farbe von Projekt ${quote(name)} geändert`,
  projectTrashed: (name: string) => `Projekt ${quote(name)} in den Papierkorb verschoben`,
  projectRestored: (name: string, renamedTo?: string) =>
    `Projekt ${quote(name)} wiederhergestellt${renamedTo ? ` als ${quote(renamedTo)}` : ''}`,
};

export type BoardKind = 'column' | 'lane' | 'label';
export type TemplateKind = 'note' | 'task';
/** A link as seen from one task: it relates to, blocks, or is blocked by the other. */
export type LinkKind = 'relates' | 'blocks' | 'blocked_by';
const KIND_LABELS: Record<BoardKind, string> = { column: 'Spalte', lane: 'Swimlane', label: 'Label' };
const TEMPLATE_LABELS: Record<TemplateKind, string> = { note: 'Notizvorlage', task: 'Taskvorlage' };

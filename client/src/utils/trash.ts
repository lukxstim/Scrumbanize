import type { RestoreResult, TrashItem, TrashType } from '../types/trash';
import { paths } from './paths';
import { countLabel } from './projects';
import { UNTITLED_NOTE } from './taskFromNote';

export type TrashFilter = 'all' | TrashType;

export function filterTrash(items: TrashItem[], filter: TrashFilter): TrashItem[] {
  return filter === 'all' ? items : items.filter((item) => item.type === filter);
}

/** The name to show: notes may be untitled. */
export function trashTitle(item: TrashItem): string {
  return item.type === 'note' ? item.title.trim() || UNTITLED_NOTE : item.title;
}

/** "3 Notizen, 1 Task und 1 Projekt" for the empty-trash confirmation; "" for nothing. */
export function trashSummary(items: TrashItem[]): string {
  const count = (type: TrashType) => items.filter((i) => i.type === type).length;
  const parts = [
    count('note') > 0 ? countLabel(count('note'), 'Notiz', 'Notizen') : '',
    count('task') > 0 ? countLabel(count('task'), 'Task', 'Tasks') : '',
    count('project') > 0 ? countLabel(count('project'), 'Projekt', 'Projekte') : '',
  ].filter(Boolean);
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} und ${parts.at(-1)}`;
}

/** The toast after restoring, and where its "Öffnen" button leads. */
export function restoredMessage(result: RestoreResult): { message: string; link: string } {
  switch (result.type) {
    case 'note':
      return {
        message: `Notiz „${result.item.title.trim() || UNTITLED_NOTE}“ wiederhergestellt.`,
        link: paths.notes(result.item.projectId, result.item.id),
      };
    case 'task':
      return { message: `Task „${result.item.title}“ wiederhergestellt.`, link: paths.task(result.item.projectId, result.item.id) };
    case 'project':
      return {
        message: result.renamedFrom
          ? `Projekt „${result.renamedFrom}“ als „${result.item.name}“ wiederhergestellt – der Name war inzwischen vergeben.`
          : `Projekt „${result.item.name}“ wiederhergestellt.`,
        link: paths.notes(result.item.id),
      };
  }
}

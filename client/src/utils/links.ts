import type { BoardColumn, LinkKind, Task, TaskLink } from '../types/task';
import type { Cells } from './board';

/** Group headings, from the point of view of the task whose links are shown. */
export const LINK_KIND_LABELS: Record<LinkKind, string> = {
  blocked_by: 'Wird blockiert von',
  blocks: 'Blockiert',
  relates: 'Hängt zusammen mit',
};

/** The order of the groups in the task details: what holds the task up comes first. */
export const LINK_KIND_ORDER: LinkKind[] = ['blocked_by', 'blocks', 'relates'];

export function groupLinks(links: TaskLink[]): { kind: LinkKind; links: TaskLink[] }[] {
  return LINK_KIND_ORDER.map((kind) => ({ kind, links: links.filter((l) => l.kind === kind) })).filter((g) => g.links.length > 0);
}

/** Tasks that block this one and are not done yet. */
export function openBlockers(task: Task): TaskLink[] {
  return task.links.filter((l) => l.kind === 'blocked_by' && !l.task.done);
}

/** The card's tooltip for the link icon: one line per link. */
export function linkSummary(task: Task): string {
  return groupLinks(task.links)
    .flatMap((g) => g.links.map((l) => `${LINK_KIND_LABELS[g.kind]} #${l.task.id} ${l.task.title}${l.task.done ? ' (erledigt)' : ''}`))
    .join('\n');
}

/**
 * After a task changed (title, column) the other tasks still show its old state in their links; this updates
 * them. `columns` decides the column name and whether it is the last ("done") one.
 */
export function refreshLinkedTask(cells: Cells, changed: Task, columns: BoardColumn[]): Cells {
  const column = columns.find((c) => c.id === changed.columnId);
  const done = columns.at(-1)?.id === changed.columnId;
  let touched = false;
  const next: Cells = {};
  for (const [key, list] of Object.entries(cells)) {
    next[key] = list.map((task) => {
      if (!task.links.some((l) => l.task.id === changed.id)) return task;
      touched = true;
      return {
        ...task,
        links: task.links.map((l) =>
          l.task.id === changed.id
            ? { ...l, task: { id: changed.id, title: changed.title, columnId: changed.columnId, columnName: column?.name ?? l.task.columnName, done } }
            : l,
        ),
      };
    });
  }
  return touched ? next : cells;
}

/** A task left the board (trash): the others stop showing links to it. */
export function dropLinksTo(cells: Cells, id: number): Cells {
  const next: Cells = {};
  for (const [key, list] of Object.entries(cells)) {
    next[key] = list.map((task) => (task.links.some((l) => l.task.id === id) ? { ...task, links: task.links.filter((l) => l.task.id !== id) } : task));
  }
  return next;
}

/** Tasks that can still be linked to `task`: the project's other tasks without a link to it yet. */
export function linkCandidates(task: Task, all: Task[]): Task[] {
  const linked = new Set(task.links.map((l) => l.task.id));
  return all.filter((t) => t.id !== task.id && !linked.has(t.id)).sort((a, b) => b.id - a.id);
}

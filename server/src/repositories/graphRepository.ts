import type { Db } from '../database.js';
import type { TaskPriority } from '../validation.js';
import { createContentLinksRepository, type ContentPlace } from './contentLinksRepository.js';
import { isDoneSql } from './doneColumn.js';

/** A note or task of another project or notebook that is linked from (or to) this one (US-22). */
type External = { external?: ContentPlace };

export type GraphNode =
  | ({ id: string; type: 'note'; entityId: number; title: string; tags: string[] } & External)
  | ({
      id: string;
      type: 'task';
      entityId: number;
      title: string;
      columnName: string;
      /** In the project's last column. */
      done: boolean;
      priority: TaskPriority | null;
      labels: { name: string; color: string }[];
    } & External);

/**
 * "converted": the task was created from the note. "blocks" points from the blocking to the blocked task.
 * "mentions": the source's text links to the target (US-22).
 */
export type GraphEdgeKind = 'converted' | 'blocks' | 'relates' | 'mentions';

export interface GraphEdge {
  source: string;
  target: string;
  kind: GraphEdgeKind;
}

export const noteNodeId = (id: number) => `note:${id}`;
export const taskNodeId = (id: number) => `task:${id}`;

export type GraphRepository = ReturnType<typeof createGraphRepository>;

/** Notes and tasks of a project and how they are connected, without contents, for the graph view. */
export function createGraphRepository(db: Db) {
  const contentLinks = createContentLinksRepository(db);
  const selectNotes = db.prepare<[number], { id: number; title: string }>(
    `SELECT id, title FROM live_notes WHERE project_id = ? ORDER BY id`,
  );
  const selectTags = db.prepare<[number], { note_id: number; name: string }>(
    `SELECT nt.note_id, t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id JOIN live_notes n ON n.id = nt.note_id
     WHERE n.project_id = ? ORDER BY t.name`,
  );
  const selectTasks = db.prepare<
    [number],
    { id: number; title: string; column_name: string; done: number; priority: TaskPriority | null; source_note_id: number | null }
  >(
    `SELECT t.id, t.title, c.name AS column_name, t.priority,
       ${isDoneSql('t')} AS done,
       (SELECT n.id FROM live_notes n WHERE n.id = t.source_note_id) AS source_note_id
     FROM live_tasks t JOIN board_columns c ON c.id = t.column_id
     WHERE t.project_id = ? ORDER BY t.id`,
  );
  // Links of trashed tasks stay in the table (until purged), so both ends must be live.
  const selectLinks = db.prepare<[number], { source_task_id: number; target_task_id: number; type: 'blocks' | 'relates' }>(
    `SELECT l.source_task_id, l.target_task_id, l.type
     FROM task_links l
     JOIN live_tasks s ON s.id = l.source_task_id
     JOIN live_tasks d ON d.id = l.target_task_id
     WHERE s.project_id = ? ORDER BY l.id`,
  );

  const selectLabels = db.prepare<[number], { task_id: number; name: string; color: string }>(
    `SELECT tl.task_id, l.name, l.color FROM task_labels tl JOIN labels l ON l.id = tl.label_id
     WHERE l.project_id = ? ORDER BY l.position, l.id`,
  );

  return {
    get(projectId: number): { nodes: GraphNode[]; edges: GraphEdge[] } {
      const labels = new Map<number, { name: string; color: string }[]>();
      for (const row of selectLabels.all(projectId)) {
        labels.set(row.task_id, [...(labels.get(row.task_id) ?? []), { name: row.name, color: row.color }]);
      }
      const tags = new Map<number, string[]>();
      for (const row of selectTags.all(projectId)) tags.set(row.note_id, [...(tags.get(row.note_id) ?? []), row.name]);

      const nodes: GraphNode[] = selectNotes.all(projectId).map((note) => ({
        id: noteNodeId(note.id),
        type: 'note',
        entityId: note.id,
        title: note.title,
        tags: tags.get(note.id) ?? [],
      }));
      const edges: GraphEdge[] = [];
      for (const task of selectTasks.all(projectId)) {
        nodes.push({
          id: taskNodeId(task.id),
          type: 'task',
          entityId: task.id,
          title: task.title,
          columnName: task.column_name,
          done: task.done === 1,
          priority: task.priority,
          labels: labels.get(task.id) ?? [],
        });
        if (task.source_note_id !== null) {
          edges.push({ source: noteNodeId(task.source_note_id), target: taskNodeId(task.id), kind: 'converted' });
        }
      }
      for (const link of selectLinks.all(projectId)) {
        edges.push({ source: taskNodeId(link.source_task_id), target: taskNodeId(link.target_task_id), kind: link.type });
      }

      // Notes and tasks of other projects the viewer may see join the graph as external nodes: notes that tasks
      // were created from (US-22), and targets of links in the text. The trash and what is out of sight stay out.
      const known = new Set(nodes.map((n) => n.id));
      /** Adds the external node if it may be shown; false if not. */
      const ensureNode = (type: 'note' | 'task', id: number): boolean => {
        const nodeId = `${type}:${id}`;
        if (known.has(nodeId)) return true;
        const resolved = contentLinks.resolveOne(type, id);
        if (resolved.status !== 'ok') return false;
        const external = { projectId: resolved.projectId, projectName: resolved.projectName, projectKind: resolved.projectKind };
        nodes.push(
          resolved.type === 'note'
            ? { id: nodeId, type: 'note', entityId: resolved.id, title: resolved.title, tags: [], external }
            : {
                id: nodeId,
                type: 'task',
                entityId: resolved.id,
                title: resolved.title,
                columnName: '',
                done: resolved.done ?? false,
                priority: null,
                labels: [],
                external,
              },
        );
        known.add(nodeId);
        return true;
      };
      const visibleEdges = edges.filter((edge) => edge.kind !== 'converted' || ensureNode('note', Number(edge.source.slice('note:'.length))));
      edges.length = 0;
      edges.push(...visibleEdges);

      const seen = new Set<string>();
      for (const link of contentLinks.ofProject(projectId)) {
        const source = `${link.source_type}:${link.source_id}`;
        const target = `${link.target_type}:${link.target_id}`;
        if (!known.has(source) || seen.has(`${source}>${target}`)) continue;
        if (!ensureNode(link.target_type, link.target_id)) continue;
        seen.add(`${source}>${target}`);
        edges.push({ source, target, kind: 'mentions' });
      }
      return { nodes, edges };
    },
  };
}

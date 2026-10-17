import { type EditField, type LinkKind, type ValueField, formatDateValue, formatPriorityValue, text } from '../activityText.js';
import type { Db } from '../database.js';
import { positionForIndex } from '../positions.js';
import { type TaskInput, type TaskPatch, type TaskPriority, scheduleProblem } from '../validation.js';
import { createActivityRepository } from './activityRepository.js';
import { createAttachmentQueries, type Attachment } from './attachmentsRepository.js';
import type { Label } from './labelsRepository.js';

export interface Task {
  id: number;
  projectId: number;
  columnId: number;
  laneId: number;
  title: string;
  description: string;
  /** Order within the task's cell (column × lane), ascending. */
  position: number;
  /** The note the task was created from, with its current tags; null if created elsewhere or the note was deleted. */
  sourceNote: { id: number; title: string; tags: string[] } | null;
  priority: TaskPriority | null;
  /** Links to other tasks of the project, oldest first; tasks in the trash are left out. */
  links: TaskLink[];
  /** Attached files, oldest first. */
  attachments: Attachment[];
  /** In the project's label order. */
  labels: Label[];
  /** Calendar dates YYYY-MM-DD; a start date always comes with a due date on or after it. */
  startDate: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskLink {
  id: number;
  /** As seen from the task carrying the link. */
  kind: LinkKind;
  /** `done`: the other task is in the project's last column. */
  task: { id: number; title: string; columnId: number; columnName: string; done: boolean };
}

interface LinkRow {
  id: number;
  type: 'relates' | 'blocks';
  source_task_id: number;
  other_id: number;
  other_title: string;
  column_id: number;
  column_name: string;
  done: number;
}

/** The short form of a task that notes carry. */
export interface LinkedTask {
  id: number;
  title: string;
  column: { id: number; name: string };
}

interface TaskRow {
  id: number;
  project_id: number;
  column_id: number;
  lane_id: number;
  title: string;
  description: string;
  position: number;
  source_note_id: number | null;
  source_note_title: string | null;
  /** Set while the source note is outside the trash; a trashed note is not shown on its tasks. */
  source_note_live: number | null;
  priority: TaskPriority | null;
  start_date: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

// Reads go through live_tasks and live_notes, which leave out the trash and the contents of trashed projects.
const selectTaskSql = `
  SELECT t.*, n.title AS source_note_title, n.id AS source_note_live
  FROM live_tasks t LEFT JOIN live_notes n ON n.id = t.source_note_id`;

export type MoveResult = { ok: true; task: Task } | { ok: false; reason: 'not_found' | 'invalid_target' };
export type LinkResult =
  | { ok: true; task: Task; target: Task }
  | { ok: false; reason: 'not_found' | 'target_not_found' | 'self' | 'other_project' | 'exists' };

export type UpdateResult =
  | { ok: true; task: Task }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'invalid_labels' }
  | { ok: false; reason: 'invalid_schedule'; message: string };

export type TasksRepository = ReturnType<typeof createTasksRepository>;

export function createTasksRepository(db: Db) {
  const activities = createActivityRepository(db);
  const attachmentQueries = createAttachmentQueries(db);
  const selectColumnName = db.prepare<[number], { name: string }>(`SELECT name FROM board_columns WHERE id = ?`);
  const selectLaneName = db.prepare<[number], { name: string }>(`SELECT name FROM lanes WHERE id = ?`);
  const columnName = (id: number) => selectColumnName.get(id)?.name ?? '';
  const laneName = (id: number) => selectLaneName.get(id)?.name ?? '';
  const selectNoteProject = db.prepare<[number], { project_id: number }>(`SELECT project_id FROM live_notes WHERE id = ?`);
  const selectFirstColumn = db.prepare<[number], { id: number }>(
    `SELECT id FROM board_columns WHERE project_id = ? ORDER BY position, id LIMIT 1`,
  );
  const selectFirstLane = db.prepare<[number], { id: number }>(
    `SELECT id FROM lanes WHERE project_id = ? ORDER BY position, id LIMIT 1`,
  );
  const selectColumnProject = db.prepare<[number], { project_id: number }>(
    `SELECT project_id FROM board_columns WHERE id = ?`,
  );
  const selectLaneProject = db.prepare<[number], { project_id: number }>(`SELECT project_id FROM lanes WHERE id = ?`);
  const nextCellPosition = db.prepare<[number, number], { position: number }>(
    `SELECT COALESCE(MAX(position), 0) + 1 AS position FROM tasks WHERE column_id = ? AND lane_id = ?`,
  );
  const insertTask = db.prepare<
    [
      number, number, number, string, string, number, number | null,
      TaskPriority | null, string | null, string | null, string, string,
    ],
    { id: number }
  >(
    `INSERT INTO tasks (project_id, column_id, lane_id, title, description, position, source_note_id,
                        priority, start_date, due_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  );
  const selectTask = db.prepare<[number], TaskRow>(`${selectTaskSql} WHERE t.id = ?`);
  const selectProjectTasks = db.prepare<[number], TaskRow>(
    `${selectTaskSql}
     JOIN board_columns c ON c.id = t.column_id
     JOIN lanes l ON l.id = t.lane_id
     WHERE t.project_id = ?
     ORDER BY c.position, l.position, t.position, t.id`,
  );
  const deleteTask = db.prepare<[number]>(`DELETE FROM tasks WHERE id = ?`);
  // A task in the trash of a project that is not itself in the trash: the ones that can be restored or purged.
  const selectTrashedTask = db.prepare<[number], { id: number; project_id: number; column_id: number; title: string }>(
    `SELECT t.id, t.project_id, t.column_id, t.title FROM tasks t JOIN live_projects p ON p.id = t.project_id
     WHERE t.id = ? AND t.deleted_at IS NOT NULL`,
  );
  const setDeletedAt = db.prepare<[string | null, number]>(`UPDATE tasks SET deleted_at = ? WHERE id = ?`);
  const selectNoteTags = db.prepare<[number], { name: string }>(
    `SELECT t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE nt.note_id = ? ORDER BY t.name`,
  );
  // The new values are always complete: the repository merges the patch with the stored row first.
  const updateTask = db.prepare<[string, string, TaskPriority | null, string | null, string | null, string, number]>(
    `UPDATE tasks SET title = ?, description = ?, priority = ?, start_date = ?, due_date = ?, updated_at = ? WHERE id = ?`,
  );
  const selectCellSiblings = db.prepare<[number, number, number], { id: number; position: number }>(
    `SELECT id, position FROM live_tasks WHERE column_id = ? AND lane_id = ? AND id != ? ORDER BY position, id`,
  );
  const updatePlacement = db.prepare<[number, number, number, string, number]>(
    `UPDATE tasks SET column_id = ?, lane_id = ?, position = ?, updated_at = ? WHERE id = ?`,
  );
  const updatePosition = db.prepare<[number, number]>(`UPDATE tasks SET position = ? WHERE id = ?`);

  // The other end of each link of a task, with its column and whether that is the last ("done") column.
  const selectLinks = db.prepare<{ id: number }, LinkRow>(
    `SELECT l.id, l.type, l.source_task_id, o.id AS other_id, o.title AS other_title, o.column_id, c.name AS column_name,
       o.column_id = (SELECT id FROM board_columns WHERE project_id = o.project_id ORDER BY position DESC, id DESC LIMIT 1) AS done
     FROM task_links l
     JOIN live_tasks o ON o.id = CASE WHEN l.source_task_id = @id THEN l.target_task_id ELSE l.source_task_id END
     JOIN board_columns c ON c.id = o.column_id
     WHERE l.source_task_id = @id OR l.target_task_id = @id
     ORDER BY l.id`,
  );
  const selectPairLink = db.prepare<[number, number, number, number], { id: number }>(
    `SELECT id FROM task_links WHERE (source_task_id = ? AND target_task_id = ?) OR (source_task_id = ? AND target_task_id = ?)`,
  );
  const selectLink = db.prepare<[number], { id: number; source_task_id: number; target_task_id: number }>(
    `SELECT id, source_task_id, target_task_id FROM task_links WHERE id = ?`,
  );
  const insertLink = db.prepare<[number, number, 'relates' | 'blocks', string]>(
    `INSERT INTO task_links (source_task_id, target_task_id, type, created_at) VALUES (?, ?, ?, ?)`,
  );
  const deleteLink = db.prepare<[number]>(`DELETE FROM task_links WHERE id = ?`);
  const selectTaskLabels = db.prepare<[number], Label>(
    `SELECT l.id, l.name, l.color FROM task_labels tl JOIN labels l ON l.id = tl.label_id WHERE tl.task_id = ? ORDER BY l.position, l.id`,
  );
  const selectProjectLabelIds = db.prepare<[number], { id: number; name: string }>(`SELECT id, name FROM labels WHERE project_id = ?`);
  const insertTaskLabel = db.prepare<[number, number]>(`INSERT OR IGNORE INTO task_labels (task_id, label_id) VALUES (?, ?)`);
  const clearTaskLabels = db.prepare<[number]>(`DELETE FROM task_labels WHERE task_id = ?`);

  /** The names of `ids` if all are labels of the project; undefined otherwise. */
  function labelNames(projectId: number, ids: number[]): Map<number, string> | undefined {
    const own = new Map(selectProjectLabelIds.all(projectId).map((row) => [row.id, row.name]));
    return ids.every((id) => own.has(id)) ? own : undefined;
  }

  function linksOf(id: number): TaskLink[] {
    return selectLinks.all({ id }).map((row) => ({
      id: row.id,
      kind: row.type === 'relates' ? 'relates' : row.source_task_id === id ? 'blocks' : 'blocked_by',
      task: { id: row.other_id, title: row.other_title, columnId: row.column_id, columnName: row.column_name, done: row.done === 1 },
    }));
  }

  function toTask(row: TaskRow): Task {
    return {
      id: row.id,
      projectId: row.project_id,
      columnId: row.column_id,
      laneId: row.lane_id,
      title: row.title,
      description: row.description,
      position: row.position,
      sourceNote:
        row.source_note_id === null || row.source_note_live === null
          ? null
          : {
              id: row.source_note_id,
              title: row.source_note_title ?? '',
              tags: selectNoteTags.all(row.source_note_id).map((t) => t.name),
            },
      priority: row.priority,
      links: linksOf(row.id),
      attachments: attachmentQueries.forTask(row.id),
      labels: selectTaskLabels.all(row.id),
      startDate: row.start_date,
      dueDate: row.due_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  return {
    /** The project a note belongs to, or undefined if the note does not exist. */
    noteProjectId(noteId: number): number | undefined {
      return selectNoteProject.get(noteId)?.project_id;
    },

    /** The project's tasks in board order: by column, lane, then position. */
    list(projectId: number): Task[] {
      return selectProjectTasks.all(projectId).map(toTask);
    },

    get(id: number): Task | undefined {
      const row = selectTask.get(id);
      return row && toTask(row);
    },

    /**
     * New tasks start at the end of `columnId` (or the first column), in `laneId` (or the first lane), with `labelIds`.
     * The caller checks that column, lane and labels belong to the project.
     */
    create: db.transaction((projectId: number, input: TaskInput): Task => {
      const now = new Date().toISOString();
      const columnId = input.columnId ?? selectFirstColumn.get(projectId)!.id;
      const laneId = input.laneId ?? selectFirstLane.get(projectId)!.id;
      const { position } = nextCellPosition.get(columnId, laneId)!;
      const sourceNoteId = input.sourceNoteId ?? null;
      const { id } = insertTask.get(
        projectId,
        columnId,
        laneId,
        input.title,
        input.description,
        position,
        sourceNoteId,
        input.priority ?? null,
        input.startDate ?? null,
        input.dueDate ?? null,
        now,
        now,
      )!;
      for (const labelId of input.labelIds ?? []) insertTaskLabel.run(id, labelId);
      const row = selectTask.get(id)!;
      const column = columnName(columnId);
      // A task converted from a note is a "create" with the source note in the metadata.
      const sourceNote = row.source_note_id === null ? undefined : (row.source_note_title ?? '');
      activities.record({
        projectId,
        entityType: 'task',
        entityId: id,
        actionType: 'create',
        description: text.taskCreated(input.title, column, sourceNote),
        metadata: {
          title: input.title,
          column: { id: columnId, name: column },
          ...(sourceNote === undefined ? {} : { sourceNote: { id: row.source_note_id, title: sourceNote } }),
        },
      });
      return toTask(row);
    }),

    /**
     * Changes the given fields; undefined keeps a value, null removes priority or a date.
     * The start/due rule is checked against the merged values, so "set only the start" works when a due date exists.
     */
    update: db.transaction((id: number, patch: TaskPatch): UpdateResult => {
      const before = selectTask.get(id);
      if (!before) return { ok: false, reason: 'not_found' };
      const names = patch.labelIds ? labelNames(before.project_id, patch.labelIds) : undefined;
      if (patch.labelIds && !names) return { ok: false, reason: 'invalid_labels' };
      const labelsBefore = selectTaskLabels.all(id).map((l) => l.id);
      const startDate = patch.startDate === undefined ? before.start_date : patch.startDate;
      const dueDate = patch.dueDate === undefined ? before.due_date : patch.dueDate;
      const problem = scheduleProblem(startDate, dueDate);
      if (problem) return { ok: false, reason: 'invalid_schedule', message: problem };
      updateTask.run(
        patch.title ?? before.title,
        patch.description ?? before.description,
        patch.priority === undefined ? before.priority : patch.priority,
        startDate,
        dueDate,
        new Date().toISOString(),
        id,
      );
      if (patch.labelIds) {
        clearTaskLabels.run(id);
        for (const labelId of patch.labelIds) insertTaskLabel.run(id, labelId);
      }
      const row = selectTask.get(id)!;
      const labelsAdded = (patch.labelIds ?? []).filter((l) => !labelsBefore.includes(l)).map((l) => names!.get(l)!);
      const labelsRemoved = patch.labelIds ? labelsBefore.filter((l) => !patch.labelIds!.includes(l)).map((l) => names!.get(l)!) : [];

      const fields: EditField[] = [];
      const values: Partial<Record<ValueField, string>> = {};
      if (before.title !== row.title) fields.push('title');
      if (before.description !== row.description) fields.push('description');
      if (before.priority !== row.priority) {
        fields.push('priority');
        values.priority = formatPriorityValue(row.priority);
      }
      if (before.start_date !== row.start_date) {
        fields.push('startDate');
        values.startDate = formatDateValue(row.start_date);
      }
      if (before.due_date !== row.due_date) {
        fields.push('dueDate');
        values.dueDate = formatDateValue(row.due_date);
      }
      activities.recordEdit({
        projectId: row.project_id,
        entityType: 'task',
        entityId: id,
        title: row.title,
        changes: {
          fields,
          tagsAdded: [],
          tagsRemoved: [],
          ...(labelsAdded.length || labelsRemoved.length ? { labelsAdded: [...new Set(labelsAdded)], labelsRemoved } : {}),
          ...(Object.keys(values).length ? { values } : {}),
        },
        describeUpdate: text.taskUpdated,
        describeCreate: (title, metadata) => {
          const source = metadata.sourceNote as { title: string } | undefined;
          return text.taskCreated(title, (metadata.column as { name: string }).name, source?.title);
        },
      });
      return { ok: true, task: toTask(row) };
    }),

    /**
     * Places the task at `index` among the other tasks of the cell (column × lane), clamped to the end.
     * Column and lane must belong to the task's project.
     */
    move: db.transaction((id: number, columnId: number, laneId: number, index: number): MoveResult => {
      const task = selectTask.get(id);
      if (!task) return { ok: false, reason: 'not_found' };
      if (
        selectColumnProject.get(columnId)?.project_id !== task.project_id ||
        selectLaneProject.get(laneId)?.project_id !== task.project_id
      ) {
        return { ok: false, reason: 'invalid_target' };
      }

      const { position, renumbered } = positionForIndex(selectCellSiblings.all(columnId, laneId, id), index);
      for (const sibling of renumbered) updatePosition.run(sibling.position, sibling.id);
      updatePlacement.run(columnId, laneId, position, new Date().toISOString(), id);

      // Reordering within the same cell is not logged; changing column or lane is.
      if (columnId !== task.column_id || laneId !== task.lane_id) {
        const from = { column: columnName(task.column_id), lane: laneName(task.lane_id) };
        const to = { column: columnName(columnId), lane: laneName(laneId) };
        activities.record({
          projectId: task.project_id,
          entityType: 'task',
          entityId: id,
          actionType: 'move',
          description: text.taskMoved(task.title, from, to),
          metadata: {
            title: task.title,
            from: { columnId: task.column_id, column: from.column, laneId: task.lane_id, lane: from.lane },
            to: { columnId, column: to.column, laneId, lane: to.lane },
          },
        });
      }
      return { ok: true, task: toTask(selectTask.get(id)!) };
    }),

    /**
     * Links the task to another task of the same project. "blocked_by" is stored as the other task blocking this
     * one, so a pair is never linked twice. Returns both tasks with their updated links.
     */
    addLink: db.transaction((id: number, targetId: number, kind: LinkKind): LinkResult => {
      const task = selectTask.get(id);
      if (!task) return { ok: false, reason: 'not_found' };
      if (targetId === id) return { ok: false, reason: 'self' };
      const target = selectTask.get(targetId);
      if (!target) return { ok: false, reason: 'target_not_found' };
      if (target.project_id !== task.project_id) return { ok: false, reason: 'other_project' };
      if (selectPairLink.get(id, targetId, targetId, id)) return { ok: false, reason: 'exists' };

      const [source, dest] = kind === 'blocked_by' ? [targetId, id] : [id, targetId];
      insertLink.run(source, dest, kind === 'relates' ? 'relates' : 'blocks', new Date().toISOString());
      activities.record({
        projectId: task.project_id,
        entityType: 'task',
        entityId: id,
        actionType: 'update',
        description: text.taskLinked(task.title, kind, target.title),
        metadata: { title: task.title, link: { kind, taskId: targetId, title: target.title } },
      });
      return { ok: true, task: toTask(selectTask.get(id)!), target: toTask(selectTask.get(targetId)!) };
    }),

    /** Removes one of the task's links. Returns both tasks with their updated links. */
    removeLink: db.transaction((id: number, linkId: number): LinkResult => {
      const task = selectTask.get(id);
      const link = selectLink.get(linkId);
      if (!task || !link || (link.source_task_id !== id && link.target_task_id !== id)) return { ok: false, reason: 'not_found' };
      const otherId = link.source_task_id === id ? link.target_task_id : link.source_task_id;
      const other = selectTask.get(otherId);
      if (!other) return { ok: false, reason: 'not_found' }; // the other task is in the trash
      deleteLink.run(linkId);
      activities.record({
        projectId: task.project_id,
        entityType: 'task',
        entityId: id,
        actionType: 'update',
        description: text.taskUnlinked(task.title, other.title),
        metadata: { title: task.title, unlinked: { taskId: otherId, title: other.title } },
      });
      return { ok: true, task: toTask(selectTask.get(id)!), target: toTask(other) };
    }),

    /** Moves the task to the trash, keeping its cell and position for a restore. False if there is no such task. */
    remove: db.transaction((id: number): boolean => {
      const before = selectTask.get(id);
      if (!before) return false;
      setDeletedAt.run(new Date().toISOString(), id);
      activities.record({
        projectId: before.project_id,
        entityType: 'task',
        entityId: id,
        actionType: 'delete',
        description: text.taskTrashed(before.title),
        metadata: { title: before.title, column: columnName(before.column_id), columnId: before.column_id },
      });
      return true;
    }),

    /**
     * Brings a task back from the trash into its column, lane and position. Columns and lanes that were deleted
     * meanwhile took their trashed tasks along to another one, so the cell always exists. WIP limits only warn.
     */
    restore: db.transaction((id: number): Task | undefined => {
      const trashed = selectTrashedTask.get(id);
      if (!trashed) return undefined;
      setDeletedAt.run(null, id);
      const column = columnName(trashed.column_id);
      activities.record({
        projectId: trashed.project_id,
        entityType: 'task',
        entityId: id,
        actionType: 'restore',
        description: text.taskRestored(trashed.title, column),
        metadata: { title: trashed.title, column, columnId: trashed.column_id },
      });
      return toTask(selectTask.get(id)!);
    }),

    /** Deletes a task in the trash for good. With `log: false` the caller records one entry for several tasks. */
    purge: db.transaction((id: number, log = true): { project_id: number; title: string } | undefined => {
      const trashed = selectTrashedTask.get(id);
      if (!trashed) return undefined;
      deleteTask.run(id);
      if (log) {
        activities.record({
          projectId: trashed.project_id,
          entityType: 'task',
          entityId: id,
          actionType: 'purge',
          description: text.taskPurged(trashed.title),
          metadata: { title: trashed.title },
        });
      }
      return trashed;
    }),
  };
}

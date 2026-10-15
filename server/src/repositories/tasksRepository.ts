import { text } from '../activityText.js';
import type { Db } from '../database.js';
import { positionForIndex } from '../positions.js';
import type { TaskInput, TaskPatch } from '../validation.js';
import { createActivityRepository } from './activityRepository.js';

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
  createdAt: string;
  updatedAt: string;
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
  created_at: string;
  updated_at: string;
}

const selectTaskSql = `
  SELECT t.*, n.title AS source_note_title
  FROM tasks t LEFT JOIN notes n ON n.id = t.source_note_id`;

export type MoveResult = { ok: true; task: Task } | { ok: false; reason: 'not_found' | 'invalid_target' };

export type TasksRepository = ReturnType<typeof createTasksRepository>;

export function createTasksRepository(db: Db) {
  const activities = createActivityRepository(db);
  const selectColumnName = db.prepare<[number], { name: string }>(`SELECT name FROM board_columns WHERE id = ?`);
  const selectLaneName = db.prepare<[number], { name: string }>(`SELECT name FROM lanes WHERE id = ?`);
  const columnName = (id: number) => selectColumnName.get(id)?.name ?? '';
  const laneName = (id: number) => selectLaneName.get(id)?.name ?? '';
  const selectNoteProject = db.prepare<[number], { project_id: number }>(`SELECT project_id FROM notes WHERE id = ?`);
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
    [number, number, number, string, string, number, number | null, string, string],
    { id: number }
  >(
    `INSERT INTO tasks (project_id, column_id, lane_id, title, description, position, source_note_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
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
  const selectNoteTags = db.prepare<[number], { name: string }>(
    `SELECT t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE nt.note_id = ? ORDER BY t.name`,
  );
  const updateTask = db.prepare<[string | null, string | null, string, number]>(
    `UPDATE tasks SET title = COALESCE(?, title), description = COALESCE(?, description), updated_at = ? WHERE id = ?`,
  );
  const selectCellSiblings = db.prepare<[number, number, number], { id: number; position: number }>(
    `SELECT id, position FROM tasks WHERE column_id = ? AND lane_id = ? AND id != ? ORDER BY position, id`,
  );
  const updatePlacement = db.prepare<[number, number, number, string, number]>(
    `UPDATE tasks SET column_id = ?, lane_id = ?, position = ?, updated_at = ? WHERE id = ?`,
  );
  const updatePosition = db.prepare<[number, number]>(`UPDATE tasks SET position = ? WHERE id = ?`);

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
        row.source_note_id === null
          ? null
          : {
              id: row.source_note_id,
              title: row.source_note_title ?? '',
              tags: selectNoteTags.all(row.source_note_id).map((t) => t.name),
            },
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
     * New tasks start at the end of the first column, in `laneId` or the first lane.
     * The caller checks that the lane belongs to the project.
     */
    create: db.transaction((projectId: number, input: TaskInput): Task => {
      const now = new Date().toISOString();
      const columnId = selectFirstColumn.get(projectId)!.id;
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
        now,
        now,
      )!;
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

    /** Changes title and/or description. Returns undefined if the task does not exist. */
    update: db.transaction((id: number, patch: TaskPatch): Task | undefined => {
      const before = selectTask.get(id);
      if (!before) return undefined;
      updateTask.run(patch.title ?? null, patch.description ?? null, new Date().toISOString(), id);
      const row = selectTask.get(id)!;
      activities.recordEdit({
        projectId: row.project_id,
        entityType: 'task',
        entityId: id,
        title: row.title,
        changes: {
          fields: [
            ...(before.title !== row.title ? (['title'] as const) : []),
            ...(before.description !== row.description ? (['description'] as const) : []),
          ],
          tagsAdded: [],
          tagsRemoved: [],
        },
        describeUpdate: text.taskUpdated,
        describeCreate: (title, metadata) => {
          const source = metadata.sourceNote as { title: string } | undefined;
          return text.taskCreated(title, (metadata.column as { name: string }).name, source?.title);
        },
      });
      return toTask(row);
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

    /** Returns false if the task did not exist. */
    remove: db.transaction((id: number): boolean => {
      const before = selectTask.get(id);
      if (!before) return false;
      deleteTask.run(id);
      activities.record({
        projectId: before.project_id,
        entityType: 'task',
        entityId: id,
        actionType: 'delete',
        description: text.taskDeleted(before.title),
        metadata: { title: before.title, column: columnName(before.column_id) },
      });
      return true;
    }),
  };
}

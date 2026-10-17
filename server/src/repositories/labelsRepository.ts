import { text } from '../activityText.js';
import type { Db } from '../database.js';
import { positionForIndex } from '../positions.js';
import { MAX_LABELS_PER_PROJECT, type LabelInput, type LabelPatch } from '../validation.js';
import { createActivityRepository } from './activityRepository.js';
import type { ProjectColor } from './projectsRepository.js';

export interface Label {
  id: number;
  name: string;
  color: ProjectColor;
}

interface LabelRow {
  id: number;
  project_id: number;
  name: string;
  color: ProjectColor;
  position: number;
}

/** The labels every new project starts with. */
export const STARTER_LABELS: LabelInput[] = [
  { name: 'Bug', color: 'red' },
  { name: 'Feature', color: 'sky' },
  { name: 'Dringend', color: 'amber' },
];

export type LabelResult =
  | { ok: true; label: Label }
  | { ok: false; reason: 'not_found' | 'name_taken' | 'limit_reached' };

const toLabel = (row: LabelRow): Label => ({ id: row.id, name: row.name, color: row.color });
const sameName = (a: string, b: string) => a.toLocaleLowerCase('de') === b.toLocaleLowerCase('de');

export type LabelsRepository = ReturnType<typeof createLabelsRepository>;

/** Colored labels of a project's tasks (US-17). */
export function createLabelsRepository(db: Db) {
  const activities = createActivityRepository(db);
  const selectLabels = db.prepare<[number], LabelRow>(`SELECT * FROM labels WHERE project_id = ? ORDER BY position, id`);
  // Labels of projects in the trash cannot be changed.
  const selectLabel = db.prepare<[number], LabelRow>(
    `SELECT l.* FROM labels l JOIN live_projects p ON p.id = l.project_id WHERE l.id = ?`,
  );
  const insertLabel = db.prepare<[number, string, string, number, string], LabelRow>(
    `INSERT INTO labels (project_id, name, color, position, created_at) VALUES (?, ?, ?, ?, ?) RETURNING *`,
  );
  const updateLabel = db.prepare<[string, string, number]>(`UPDATE labels SET name = ?, color = ? WHERE id = ?`);
  const updatePosition = db.prepare<[number, number]>(`UPDATE labels SET position = ? WHERE id = ?`);
  const deleteLabel = db.prepare<[number]>(`DELETE FROM labels WHERE id = ?`);
  // Tasks in the trash keep their labels, but only tasks on the board count as "affected".
  const countTasks = db.prepare<[number], { n: number }>(
    `SELECT COUNT(*) AS n FROM task_labels tl JOIN live_tasks t ON t.id = tl.task_id WHERE tl.label_id = ?`,
  );
  const selectProjectTaskTemplates = db.prepare<[number], { id: number; defaults: string }>(
    `SELECT id, defaults FROM templates WHERE project_id = ? AND kind = 'task'`,
  );
  const updateTemplateDefaults = db.prepare<[string, number]>(`UPDATE templates SET defaults = ? WHERE id = ?`);

  function log(projectId: number, id: number, actionType: 'create' | 'update' | 'delete', description: string, metadata: object) {
    activities.record({ projectId, entityType: 'board', entityId: id, actionType, description, metadata: { kind: 'label', ...metadata } });
  }

  const nameTaken = (projectId: number, name: string, exceptId?: number) =>
    selectLabels.all(projectId).some((row) => row.id !== exceptId && sameName(row.name, name));

  function insert(projectId: number, input: LabelInput): LabelRow {
    const rows = selectLabels.all(projectId);
    return insertLabel.get(projectId, input.name, input.color, (rows.at(-1)?.position ?? 0) + 1, new Date().toISOString())!;
  }

  return {
    list: (projectId: number): Label[] => selectLabels.all(projectId).map(toLabel),

    projectOf: (id: number): number | undefined => selectLabel.get(id)?.project_id,

    /** Whether all ids are labels of the project. */
    allInProject(projectId: number, ids: number[]): boolean {
      const own = new Set(selectLabels.all(projectId).map((row) => row.id));
      return ids.every((id) => own.has(id));
    },

    /** Bug, Feature, Dringend for a new project; not logged (part of creating the project). */
    createStarters(projectId: number): void {
      for (const label of STARTER_LABELS) insert(projectId, label);
    },

    create: db.transaction((projectId: number, input: LabelInput): LabelResult => {
      if (selectLabels.all(projectId).length >= MAX_LABELS_PER_PROJECT) return { ok: false, reason: 'limit_reached' };
      if (nameTaken(projectId, input.name)) return { ok: false, reason: 'name_taken' };
      const row = insert(projectId, input);
      log(projectId, row.id, 'create', text.itemCreated('label', row.name), { name: row.name, color: row.color });
      return { ok: true, label: toLabel(row) };
    }),

    /** A new name also changes the project's task templates that name the label. */
    update: db.transaction((id: number, patch: LabelPatch): LabelResult => {
      const before = selectLabel.get(id);
      if (!before) return { ok: false, reason: 'not_found' };
      const name = patch.name ?? before.name;
      const color = patch.color ?? before.color;
      if (patch.name !== undefined && nameTaken(before.project_id, name, id)) return { ok: false, reason: 'name_taken' };
      updateLabel.run(name, color, id);

      if (name !== before.name) {
        log(before.project_id, id, 'update', text.itemRenamed('label', before.name, name), { name, from: before.name, to: name });
        for (const template of selectProjectTaskTemplates.all(before.project_id)) {
          const defaults = JSON.parse(template.defaults) as { labels?: string[] };
          if (!defaults.labels?.some((l) => sameName(l, before.name))) continue;
          defaults.labels = defaults.labels.map((l) => (sameName(l, before.name) ? name : l));
          updateTemplateDefaults.run(JSON.stringify(defaults), template.id);
        }
      }
      if (color !== before.color) log(before.project_id, id, 'update', text.labelRecolored(name), { name, color: { from: before.color, to: color } });
      return { ok: true, label: toLabel(selectLabel.get(id)!) };
    }),

    /** Places the label at `index` among the project's other labels. */
    move: db.transaction((id: number, index: number): LabelResult => {
      const row = selectLabel.get(id);
      if (!row) return { ok: false, reason: 'not_found' };
      const siblings = selectLabels.all(row.project_id).filter((r) => r.id !== id);
      const { position, renumbered } = positionForIndex(siblings, index);
      for (const sibling of renumbered) updatePosition.run(sibling.position, sibling.id);
      updatePosition.run(position, id);
      return { ok: true, label: toLabel(row) };
    }),

    /** How many tasks on the board carry the label (for the confirmation before deleting). */
    usage: (id: number): number => countTasks.get(id)!.n,

    /** Deletes the label and takes it off all tasks. False if there is no such label. */
    remove: db.transaction((id: number): boolean => {
      const row = selectLabel.get(id);
      if (!row) return false;
      const tasks = countTasks.get(id)!.n;
      deleteLabel.run(id);
      log(row.project_id, id, 'delete', text.labelDeleted(row.name, tasks), { name: row.name, tasks });
      return true;
    }),
  };
}

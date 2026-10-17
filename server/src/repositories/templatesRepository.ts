import { ZodError } from 'zod';
import { text, type TemplateKind } from '../activityText.js';
import type { Db } from '../database.js';
import {
  MAX_TEMPLATES,
  noteTemplateDefaultsSchema,
  taskTemplateDefaultsSchema,
  type NoteTemplateDefaults,
  type TaskTemplateDefaults,
  type TemplateInput,
  type TemplatePatch,
} from '../validation.js';
import { createActivityRepository } from './activityRepository.js';

export type Template =
  | (TemplateBase & { kind: 'note'; defaults: NoteTemplateDefaults })
  | (TemplateBase & { kind: 'task'; defaults: TaskTemplateDefaults });

interface TemplateBase {
  id: number;
  /** "global": usable in every project. */
  scope: 'project' | 'global';
  name: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface TemplateRow {
  id: number;
  project_id: number | null;
  kind: TemplateKind;
  name: string;
  title: string;
  content: string;
  defaults: string;
  created_at: string;
  updated_at: string;
}

export type TemplateResult =
  | { ok: true; template: Template }
  | { ok: false; reason: 'not_found' | 'name_taken' | 'limit_reached' };

/** Stored defaults are read leniently: anything unknown or missing falls back to "nothing set". */
function parseDefaults(kind: TemplateKind, raw: string) {
  const schema = kind === 'note' ? noteTemplateDefaultsSchema : taskTemplateDefaultsSchema;
  const parsed = schema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : schema.parse({});
}

const toTemplate = (row: TemplateRow): Template =>
  ({
    id: row.id,
    kind: row.kind,
    scope: row.project_id === null ? 'global' : 'project',
    name: row.name,
    title: row.title,
    content: row.content,
    defaults: parseDefaults(row.kind, row.defaults),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }) as Template;

const sameName = (a: string, b: string) => a.toLocaleLowerCase('de') === b.toLocaleLowerCase('de');

export type TemplatesRepository = ReturnType<typeof createTemplatesRepository>;

/**
 * Templates for new notes and tasks (US-17), per project or for all projects. Every call names the project it is
 * made from: it decides which templates are visible and where the change is logged.
 */
export function createTemplatesRepository(db: Db) {
  const activities = createActivityRepository(db);
  const selectVisible = db.prepare<[number], TemplateRow>(
    `SELECT * FROM templates WHERE project_id = ? OR project_id IS NULL ORDER BY name COLLATE NOCASE, id`,
  );
  const selectInScope = db.prepare<[number | null, TemplateKind], TemplateRow>(
    `SELECT * FROM templates WHERE project_id IS ? AND kind = ?`,
  );
  const countVisible = db.prepare<[number], { n: number }>(`SELECT COUNT(*) AS n FROM templates WHERE project_id = ? OR project_id IS NULL`);
  const insert = db.prepare<[number | null, TemplateKind, string, string, string, string, string, string], TemplateRow>(
    `INSERT INTO templates (project_id, kind, name, title, content, defaults, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  );
  const update = db.prepare<[number | null, string, string, string, string, string, number]>(
    `UPDATE templates SET project_id = ?, name = ?, title = ?, content = ?, defaults = ?, updated_at = ? WHERE id = ?`,
  );
  const remove = db.prepare<[number]>(`DELETE FROM templates WHERE id = ?`);

  /** The template, if the project may use it (its own or a global one). */
  const visibleRow = (projectId: number, id: number) => selectVisible.all(projectId).find((row) => row.id === id);
  const nameTaken = (scopeProject: number | null, kind: TemplateKind, name: string, exceptId?: number) =>
    selectInScope.all(scopeProject, kind).some((row) => row.id !== exceptId && sameName(row.name, name));

  function log(projectId: number, kind: TemplateKind, id: number, actionType: 'create' | 'update' | 'delete', description: string, metadata: object) {
    // Logged under the kind of what the template creates, without an entity of its own (like an import).
    activities.record({ projectId, entityType: kind, entityId: null, actionType, description, metadata: { template: id, ...metadata } });
  }

  return {
    /** The project's templates and those for all projects, by name. */
    list(projectId: number, kind?: TemplateKind): Template[] {
      return selectVisible
        .all(projectId)
        .filter((row) => !kind || row.kind === kind)
        .map(toTemplate);
    },

    create: db.transaction((projectId: number, input: TemplateInput): TemplateResult => {
      const scopeProject = input.scope === 'global' ? null : projectId;
      if (countVisible.get(projectId)!.n >= MAX_TEMPLATES) return { ok: false, reason: 'limit_reached' };
      if (nameTaken(scopeProject, input.kind, input.name)) return { ok: false, reason: 'name_taken' };
      const now = new Date().toISOString();
      const row = insert.get(scopeProject, input.kind, input.name, input.title, input.content, JSON.stringify(input.defaults), now, now)!;
      log(projectId, row.kind, row.id, 'create', text.templateCreated(row.kind, row.name, scopeProject === null), { name: row.name });
      return { ok: true, template: toTemplate(row) };
    }),

    /** Changes fields; the defaults are checked against the template's kind (throws a ZodError if they do not fit). */
    update: db.transaction((projectId: number, id: number, patch: TemplatePatch): TemplateResult => {
      const before = visibleRow(projectId, id);
      if (!before) return { ok: false, reason: 'not_found' };
      const scopeProject = patch.scope === undefined ? before.project_id : patch.scope === 'global' ? null : projectId;
      const name = patch.name ?? before.name;
      if ((patch.name !== undefined || patch.scope !== undefined) && nameTaken(scopeProject, before.kind, name, id)) {
        return { ok: false, reason: 'name_taken' };
      }
      let defaults = before.defaults;
      if (patch.defaults !== undefined) {
        const schema = before.kind === 'note' ? noteTemplateDefaultsSchema : taskTemplateDefaultsSchema;
        const parsed = schema.safeParse(patch.defaults);
        if (!parsed.success) throw new ZodError(parsed.error.issues.map((issue) => ({ ...issue, path: ['defaults', ...issue.path] })));
        defaults = JSON.stringify(parsed.data);
      }
      const title = patch.title ?? before.title;
      const content = patch.content ?? before.content;
      update.run(scopeProject, name, title, content, defaults, new Date().toISOString(), id);

      if (name !== before.name) log(projectId, before.kind, id, 'update', text.templateRenamed(before.kind, before.name, name), { from: before.name, to: name });
      const changed = title !== before.title || content !== before.content || defaults !== before.defaults || scopeProject !== before.project_id;
      if (changed) log(projectId, before.kind, id, 'update', text.templateUpdated(before.kind, name), { name });
      return { ok: true, template: toTemplate(visibleRow(projectId, id) ?? { ...before, project_id: scopeProject, name, title, content, defaults }) };
    }),

    remove: db.transaction((projectId: number, id: number): boolean => {
      const row = visibleRow(projectId, id);
      if (!row) return false;
      remove.run(id);
      log(projectId, row.kind, id, 'delete', text.templateDeleted(row.kind, row.name), { name: row.name });
      return true;
    }),
  };
}

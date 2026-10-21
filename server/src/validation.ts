import { z } from 'zod';
import { isTimeZone } from './analytics.js';
import { ENTITY_TYPES } from './repositories/activityRepository.js';
import { PROJECT_COLORS } from './repositories/projectsRepository.js';

export const MAX_TAG_LENGTH = 32;
export const MAX_LABELS_PER_PROJECT = 30;
export const MAX_TEMPLATES = 50;
export const MAX_TAGS_PER_NOTE = 50;

/** Keep in sync with normalizeTag in client/src/utils/tags.ts. */
export function normalizeTag(raw: string): string {
  return raw
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, MAX_TAG_LENGTH)
    .trim();
}

/** The fixed symbols of notebooks (US-22); keep in sync with client/src/components/notebookIcons.tsx. */
export const NOTEBOOK_ICONS = [
  'book', 'briefcase', 'graduation', 'house', 'heart', 'star', 'lightbulb', 'code',
  'music', 'plane', 'utensils', 'leaf', 'dumbbell', 'camera', 'wallet', 'users',
] as const;
export type NotebookIcon = (typeof NOTEBOOK_ICONS)[number];

export const projectInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.enum(PROJECT_COLORS),
  /** A notebook (US-22): notes only, no board. Fixed once created. */
  kind: z.enum(['project', 'notebook']).default('project'),
  /** Notebooks only. */
  icon: z.enum(NOTEBOOK_ICONS).nullable().optional(),
});

export type ProjectInput = z.infer<typeof projectInputSchema>;

export const projectPatchSchema = z.object({
  name: projectInputSchema.shape.name.optional(),
  color: projectInputSchema.shape.color.optional(),
  icon: projectInputSchema.shape.icon,
});

export type ProjectPatch = z.infer<typeof projectPatchSchema>;

export const noteInputSchema = z.object({
  title: z.string().trim().max(200),
  content: z.string().max(1_000_000),
  tags: z
    .array(z.string())
    .max(MAX_TAGS_PER_NOTE)
    .transform((tags) => [...new Set(tags.map(normalizeTag).filter(Boolean))]),
});

export type NoteInput = z.infer<typeof noteInputSchema>;

/** Saving a note (US-24): `baseUpdatedAt` is the version the edit started from; a newer one on the server is a conflict (409). */
export const noteUpdateSchema = noteInputSchema.extend({ baseUpdatedAt: z.iso.datetime().optional() });

/** Folders of notes (US-22). */
const folderIdSchema = z.number().int().positive().nullable();
export const noteFolderSchema = z.object({ folderId: folderIdSchema });
export const newNoteFolderSchema = z.object({ folderId: folderIdSchema.optional() });
export const folderInputSchema = z.object({ name: z.string().trim().min(1).max(80), parentId: folderIdSchema.default(null) });
export const folderPatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  parentId: folderIdSchema.optional(),
  /** Position among the (new) parent's other folders. */
  index: z.number().int().min(0).optional(),
});

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** A calendar date YYYY-MM-DD that exists (no 2026-02-30). */
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected a date YYYY-MM-DD')
  // Zod runs this even when the regex failed, so an unparsable string must not reach toISOString().
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, 'not a valid date');

/** Priority and dates of a task; null removes a value, undefined keeps it. */
const scheduleFields = {
  priority: z.enum(TASK_PRIORITIES).nullable().optional(),
  startDate: dateSchema.nullable().optional(),
  dueDate: dateSchema.nullable().optional(),
};

/** Why a start/due combination is not allowed, or undefined if it is fine. */
export function scheduleProblem(startDate: string | null, dueDate: string | null): string | undefined {
  if (startDate && !dueDate) return 'startDate requires a dueDate';
  if (startDate && dueDate && startDate > dueDate) return 'startDate must not be after dueDate';
  return undefined;
}

export const taskInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(1_000_000),
    sourceNoteId: z.number().int().positive().optional(),
    /** The lane to create the task in; the first lane if omitted. */
    laneId: z.number().int().positive().optional(),
    /** The column to create the task in (e.g. from a template); the first column if omitted. */
    columnId: z.number().int().positive().optional(),
    labelIds: z.array(z.number().int().positive()).max(MAX_LABELS_PER_PROJECT).optional(),
    ...scheduleFields,
  })
  .superRefine((input, ctx) => {
    const problem = scheduleProblem(input.startDate ?? null, input.dueDate ?? null);
    if (problem) ctx.addIssue({ code: 'custom', path: ['startDate'], message: problem });
  });

export type TaskInput = z.infer<typeof taskInputSchema>;

/** The start/due rule is checked against the stored values in the repository. */
export const taskPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(1_000_000).optional(),
  /** Replaces the task's labels. */
  labelIds: z.array(z.number().int().positive()).max(MAX_LABELS_PER_PROJECT).optional(),
  ...scheduleFields,
  /**
   * Title and description as they were when the edit started (US-24). If someone else changed one of them since, the
   * save is a conflict (409). Moves and other fields bump updated_at, so this is per field rather than by time.
   */
  base: z.object({ title: z.string().max(200).optional(), description: z.string().max(1_000_000).optional() }).optional(),
});

export type TaskPatch = z.infer<typeof taskPatchSchema>;

/** A link from the task in the URL to `targetId`, as seen from the former. */
export const taskLinkInputSchema = z.object({
  targetId: z.number().int().positive(),
  kind: z.enum(['relates', 'blocks', 'blocked_by']),
});

export const moveTaskSchema = z.object({
  columnId: z.number().int().positive(),
  laneId: z.number().int().positive(),
  /** Target index within the destination cell, not counting the moved task; clamped to the cell's end. */
  index: z.number().int().min(0),
});

const boardNameSchema = z.string().trim().min(1).max(40);
const wipLimitSchema = z.number().int().min(1).max(999).nullable();

/** Limits of a column width in pixels; keep in sync with client/src/utils/columnWidths.ts and migration 13. */
export const MIN_COLUMN_WIDTH = 200;
export const MAX_COLUMN_WIDTH = 600;
/** null: the client's default width. */
const columnWidthSchema = z.number().int().min(MIN_COLUMN_WIDTH).max(MAX_COLUMN_WIDTH).nullable();

export const columnInputSchema = z.object({ name: boardNameSchema, wipLimit: wipLimitSchema.optional() });
export const columnPatchSchema = z.object({
  name: boardNameSchema.optional(),
  wipLimit: wipLimitSchema.optional(),
  width: columnWidthSchema.optional(),
});

/** Several column widths at once ("An Fenster anpassen", "Spaltenbreiten zurücksetzen"). */
export const columnWidthsSchema = z.object({
  widths: z.array(z.object({ id: z.number().int().positive(), width: columnWidthSchema })).max(100),
});
export const laneInputSchema = z.object({ name: boardNameSchema });

/** Reordering a column or lane: its new index among the others. */
export const reorderSchema = z.object({ index: z.number().int().min(0) });

/** Where the tasks of a deleted column or lane go. */
export const deleteBoardItemQuerySchema = z.object({ moveTasksTo: z.coerce.number().int().positive().optional() });

export const idParamSchema = z.coerce.number().int().positive();

export const noteListQuerySchema = z.object({
  q: z.string().optional(),
  tag: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => (value === undefined ? [] : [value].flat().map(normalizeTag).filter(Boolean))),
});

export const activityQuerySchema = z.object({
  /** Only entries of this area; all if omitted. */
  type: z.enum(ENTITY_TYPES).optional(),
  /** Id of the last entry of the previous page. */
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

/** What can be in the trash. */
export const TRASH_TYPES = ['note', 'task', 'project'] as const;
export type TrashType = (typeof TRASH_TYPES)[number];
export const trashTypeSchema = z.enum(TRASH_TYPES);

export const trashQuerySchema = z.object({
  /** Only this project's notes and tasks; all projects if omitted. */
  project: z.coerce.number().int().positive().optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().max(200).default(''),
  /** Hits of this project come first. */
  project: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Login and accounts (US-21). Limits of passwords: auth/passwords.ts. */
const emailSchema = z.string().trim().toLowerCase().max(254).email();
const userNameSchema = z.string().trim().min(1).max(80);
const newPasswordSchema = z.string().min(10).max(200);

export const PROJECT_ROLES = ['owner', 'member', 'viewer'] as const;
export const memberInputSchema = z.object({ email: z.string().trim().max(254), role: z.enum(PROJECT_ROLES) });
export const memberPatchSchema = z.object({ role: z.enum(PROJECT_ROLES) });

// Accounts (US-21c)
export const profilePatchSchema = z.object({ name: userNameSchema.optional(), avatarColor: z.enum(PROJECT_COLORS).optional() });
export const passwordChangeSchema = z.object({ current: z.string().max(200), password: newPasswordSchema });
export const registerSchema = z.object({ token: z.string().min(10).max(200), name: userNameSchema, password: newPasswordSchema });
export const resetPasswordSchema = z.object({ token: z.string().min(10).max(200), password: newPasswordSchema });
export const invitationSchema = z.object({ email: emailSchema });
export const accountPatchSchema = z.object({ systemRole: z.enum(['admin', 'user']).optional(), disabled: z.boolean().optional() });
export const handOverSchema = z.object({ toUserId: z.number().int().positive() });

export const loginSchema = z.object({ email: z.string().trim().max(254), password: z.string().max(200) });
export const setupSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: userNameSchema,
  email: emailSchema,
  password: newPasswordSchema,
});

/** GET /api/reminders/due?date=…: the caller's local date, since only it knows its time zone. */
export const remindersQuerySchema = z.object({ date: dateSchema });

/** At most this many days between `from` and `to`, so a report stays quick. */
export const MAX_ANALYTICS_DAYS = 2 * 366;

export const analyticsQuerySchema = z
  .object({
    /** First and last day; the last DEFAULT_WEEKS weeks if omitted. Both are widened to whole weeks or months. */
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    granularity: z.enum(['week', 'month']).default('week'),
    /** IANA time zone of the viewer; days and weeks are counted there. */
    tz: z.string().max(64).refine(isTimeZone, 'unknown time zone').default('UTC'),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: 'from must not be after to', path: ['from'] })
  .refine((q) => !q.from || !q.to || (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 <= MAX_ANALYTICS_DAYS, {
    message: `the range must not be longer than ${MAX_ANALYTICS_DAYS} days`,
    path: ['to'],
  });

export const exportQuerySchema = z.object({
  format: z.enum(['md', 'html']).default('md'),
});

/** Notes per import request; the wizard sends larger imports in several batches. */
export const MAX_IMPORT_BATCH = 50;

export const importNotesSchema = z.object({
  notes: z
    .array(
      noteInputSchema.extend({
        title: z.string().trim().min(1).max(200),
        /** From the file's front matter. */
        createdAt: z.iso.datetime({ offset: true }).optional(),
      }),
    )
    .max(MAX_IMPORT_BATCH),
});

export const labelInputSchema = z.object({
  name: z.string().trim().min(1).max(30),
  color: z.enum(PROJECT_COLORS),
});

export const labelPatchSchema = labelInputSchema.partial();

export type LabelInput = z.infer<typeof labelInputSchema>;
export type LabelPatch = z.infer<typeof labelPatchSchema>;

/** What a new note or task gets besides title and text. Labels, column and lane are matched by name in the project. */
export const noteTemplateDefaultsSchema = z.object({
  tags: z
    .array(z.string())
    .max(MAX_TAGS_PER_NOTE)
    .transform((tags) => [...new Set(tags.map(normalizeTag).filter(Boolean))])
    .default([]),
});

export const taskTemplateDefaultsSchema = z.object({
  priority: z.enum(TASK_PRIORITIES).nullable().default(null),
  labels: z.array(z.string().trim().min(1).max(30)).max(MAX_LABELS_PER_PROJECT).default([]),
  column: z.string().trim().min(1).max(60).nullable().default(null),
  lane: z.string().trim().min(1).max(60).nullable().default(null),
  /** Due this many days after the task is created ("+7 Tage"); 0 is the same day. */
  dueInDays: z.number().int().min(0).max(365).nullable().default(null),
});

export type NoteTemplateDefaults = z.infer<typeof noteTemplateDefaultsSchema>;
export type TaskTemplateDefaults = z.infer<typeof taskTemplateDefaultsSchema>;

const templateBase = {
  name: z.string().trim().min(1).max(60),
  /** May contain placeholders like {{datum}}; filled in when the template is used. */
  title: z.string().max(200).default(''),
  content: z.string().max(1_000_000).default(''),
  /** "global": usable in every project. */
  scope: z.enum(['project', 'global']).default('project'),
};

export const templateInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('note'), ...templateBase, defaults: noteTemplateDefaultsSchema.default({ tags: [] }) }),
  z.object({
    kind: z.literal('task'),
    ...templateBase,
    defaults: taskTemplateDefaultsSchema.default({ priority: null, labels: [], column: null, lane: null, dueInDays: null }),
  }),
]);

export type TemplateInput = z.infer<typeof templateInputSchema>;

/** The kind stays; the defaults are checked against it in the repository. */
export const templatePatchSchema = z.object({
  name: templateBase.name.optional(),
  title: z.string().max(200).optional(),
  content: z.string().max(1_000_000).optional(),
  scope: z.enum(['project', 'global']).optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
});

export type TemplatePatch = z.infer<typeof templatePatchSchema>;

export const templateQuerySchema = z.object({
  kind: z.enum(['note', 'task']).optional(),
});


/** Links between notes and tasks (US-22). */
const contentRefSchema = z.object({ type: z.enum(['note', 'task']), id: z.number().int().positive() });
export const resolveLinksSchema = z.object({ refs: z.array(contentRefSchema).max(500) });
export const linkCandidatesQuerySchema = z.object({
  q: z.string().trim().max(200).default(''),
  /** Candidates of this project come first. */
  project: z.coerce.number().int().positive().optional(),
});

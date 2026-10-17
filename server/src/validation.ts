import { z } from 'zod';
import { isTimeZone } from './analytics.js';
import { ENTITY_TYPES } from './repositories/activityRepository.js';
import { PROJECT_COLORS } from './repositories/projectsRepository.js';

export const MAX_TAG_LENGTH = 32;
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

export const projectInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.enum(PROJECT_COLORS),
});

export type ProjectInput = z.infer<typeof projectInputSchema>;

export const projectPatchSchema = projectInputSchema.partial();

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
  ...scheduleFields,
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

export const columnInputSchema = z.object({ name: boardNameSchema, wipLimit: wipLimitSchema.optional() });
export const columnPatchSchema = z.object({ name: boardNameSchema.optional(), wipLimit: wipLimitSchema.optional() });
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

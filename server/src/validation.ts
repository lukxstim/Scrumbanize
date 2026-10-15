import { z } from 'zod';
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

export const taskInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(1_000_000),
  sourceNoteId: z.number().int().positive().optional(),
  /** The lane to create the task in; the first lane if omitted. */
  laneId: z.number().int().positive().optional(),
});

export type TaskInput = z.infer<typeof taskInputSchema>;

export const taskPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(1_000_000).optional(),
});

export type TaskPatch = z.infer<typeof taskPatchSchema>;

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

export const searchQuerySchema = z.object({
  q: z.string().trim().max(200).default(''),
  /** Hits of this project come first. */
  project: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

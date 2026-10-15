import { z } from 'zod';
import { TASK_STATUSES, WIP_LIMITED_STATUSES } from './repositories/tasksRepository.js';

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
});

export type TaskInput = z.infer<typeof taskInputSchema>;

export const taskPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(1_000_000).optional(),
});

export type TaskPatch = z.infer<typeof taskPatchSchema>;

export const moveTaskSchema = z.object({
  status: z.enum(TASK_STATUSES),
  /** Target index within the destination column, not counting the moved task; clamped to the column's end. */
  index: z.number().int().min(0),
});

export const wipLimitStatusSchema = z.enum(WIP_LIMITED_STATUSES);

export const wipLimitSchema = z.object({
  wipLimit: z.number().int().min(1).max(999).nullable(),
});

export const idParamSchema =z.coerce.number().int().positive();

export const noteListQuerySchema = z.object({
  q: z.string().optional(),
  tag: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => (value === undefined ? [] : [value].flat().map(normalizeTag).filter(Boolean))),
});

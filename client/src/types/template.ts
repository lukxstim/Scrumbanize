import type { TaskPriority } from './task';

/** Mirrors server/src/repositories/templatesRepository.ts. */
export type TemplateKind = 'note' | 'task';

export interface NoteTemplateDefaults {
  tags: string[];
}

/** Labels, column and lane by name: matched in the project the template is used in. */
export interface TaskTemplateDefaults {
  priority: TaskPriority | null;
  labels: string[];
  column: string | null;
  lane: string | null;
  /** Due this many days after creating ("+7 Tage"); 0 is the same day. */
  dueInDays: number | null;
}

interface TemplateBase {
  id: number;
  /** "global": usable in every project. */
  scope: 'project' | 'global';
  name: string;
  /** With placeholders like {{datum}}. */
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export type NoteTemplate = TemplateBase & { kind: 'note'; defaults: NoteTemplateDefaults };
export type TaskTemplate = TemplateBase & { kind: 'task'; defaults: TaskTemplateDefaults };
export type Template = NoteTemplate | TaskTemplate;

export type TemplateInput =
  | { kind: 'note'; scope: 'project' | 'global'; name: string; title: string; content: string; defaults: NoteTemplateDefaults }
  | { kind: 'task'; scope: 'project' | 'global'; name: string; title: string; content: string; defaults: TaskTemplateDefaults };

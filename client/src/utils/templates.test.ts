import { describe, expect, it } from 'vitest';
import type { Label } from '../types/task';
import type { NoteTemplate, TaskTemplate } from '../types/template';
import { matchLabels } from './labels';
import { dueInDaysLabel, fillPlaceholders, noteFromTemplate, sortTemplates, taskFromTemplate } from './templates';
import { matchesView, DEFAULT_VIEW, isTaskView } from './taskView';

// Saturday, 17 October 2026, 09:05 local time.
const now = new Date(2026, 9, 17, 9, 5);
const context = { now, projectName: 'Website' };

const base = { id: 1, scope: 'global' as const, createdAt: '', updatedAt: '' };
const labels: Label[] = [
  { id: 10, name: 'Bug', color: 'red' },
  { id: 11, name: 'Dringend', color: 'amber' },
];
const board = {
  labels,
  columns: [
    { id: 1, name: 'Backlog', position: 1, wipLimit: null, width: null },
    { id: 2, name: 'To Do', position: 2, wipLimit: null, width: null },
  ],
  lanes: [
    { id: 5, name: 'Standard', position: 1 },
    { id: 6, name: 'Kunden', position: 2 },
  ],
};

describe('fillPlaceholders', () => {
  it('fills date, weekday, time, week and project, in any case and spacing', () => {
    expect(fillPlaceholders('{{datum}} {{ Wochentag }} {{UHRZEIT}} KW {{kw}} – {{projekt}}', context)).toBe(
      '17.10.2026 Samstag 09:05 KW 42 – Website',
    );
  });

  it('leaves unknown placeholders alone', () => {
    expect(fillPlaceholders('{{name}} und {{datum}}', context)).toBe('{{name}} und 17.10.2026');
  });
});

describe('noteFromTemplate', () => {
  const template: NoteTemplate = { ...base, kind: 'note', name: 'Meeting-Protokoll', title: 'Meeting {{datum}}', content: '**{{wochentag}}**', defaults: { tags: ['meeting'] } };

  it('fills title and text and takes the tags', () => {
    expect(noteFromTemplate(template, context)).toEqual({ title: 'Meeting 17.10.2026', content: '**Samstag**', tags: ['meeting'] });
  });

  it('falls back to the template name for an empty title', () => {
    expect(noteFromTemplate({ ...template, title: '  ' }, context).title).toBe('Meeting-Protokoll');
  });
});

describe('taskFromTemplate', () => {
  const template: TaskTemplate = {
    ...base,
    kind: 'task',
    name: 'Bug-Report',
    title: 'Bug {{datum}}',
    content: '## Schritte',
    defaults: { priority: 'high', labels: ['bug', 'Kunde'], column: 'to do', lane: 'Kunden', dueInDays: 7 },
  };

  it('matches labels, column and lane by name and counts the due date from today', () => {
    expect(taskFromTemplate(template, board, context)).toEqual({
      input: {
        title: 'Bug 17.10.2026',
        description: '## Schritte',
        priority: 'high',
        labelIds: [10],
        columnId: 2,
        laneId: 6,
        dueDate: '2026-10-24',
      },
      missing: ['Label „Kunde“'],
    });
  });

  it('lets a typed title and the cell’s lane win when the template has none', () => {
    const plain: TaskTemplate = { ...template, defaults: { priority: null, labels: [], column: 'Gibt es nicht', lane: null, dueInDays: null } };
    expect(taskFromTemplate(plain, board, { ...context, title: ' Eigener Titel ', laneId: 5 })).toEqual({
      input: { title: 'Eigener Titel', description: '## Schritte', priority: null, laneId: 5 },
      missing: ['Spalte „Gibt es nicht“'],
    });
  });

  it('counts "same day" as today', () => {
    const today: TaskTemplate = { ...template, defaults: { ...template.defaults, dueInDays: 0 } };
    expect(taskFromTemplate(today, board, context).input.dueDate).toBe('2026-10-17');
  });
});

describe('helpers', () => {
  it('sorts own templates first, then by name', () => {
    const t = (name: string, scope: 'project' | 'global') => ({ ...base, scope, kind: 'note' as const, name, title: '', content: '', defaults: { tags: [] } });
    expect(sortTemplates([t('Zeta', 'project'), t('Alpha', 'global'), t('beta', 'project')]).map((x) => x.name)).toEqual(['beta', 'Zeta', 'Alpha']);
  });

  it('labels relative due dates', () => {
    expect([null, 0, 1, 7].map(dueInDaysLabel)).toEqual(['keine', 'am selben Tag', '+1 Tag', '+7 Tage']);
  });

  it('matches labels without duplicates', () => {
    expect(matchLabels(['Bug', 'BUG', 'x'], labels)).toEqual({ found: [labels[0]], missing: ['x'] });
  });
});

describe('label filter on the board', () => {
  const task = (ids: number[]) =>
    ({ priority: null, dueDate: null, labels: ids.map((id) => labels.find((l) => l.id === id)!) }) as unknown as Parameters<typeof matchesView>[0];

  it('shows tasks with at least one chosen label, or without any for "none"', () => {
    const view = { ...DEFAULT_VIEW, labels: [10, 'none' as const] };
    expect(matchesView(task([10, 11]), view, '2026-10-17', false)).toBe(true);
    expect(matchesView(task([11]), view, '2026-10-17', false)).toBe(false);
    expect(matchesView(task([]), view, '2026-10-17', false)).toBe(true);
  });

  it('accepts views stored before labels existed', () => {
    expect(isTaskView({ sort: 'manual', priorities: [], due: 'all' })).toBe(true);
    expect(isTaskView({ sort: 'manual', priorities: [], due: 'all', labels: ['x'] })).toBe(false);
  });
});

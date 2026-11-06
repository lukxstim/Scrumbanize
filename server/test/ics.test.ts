import { describe, expect, it } from 'vitest';
import { buildCalendar, escapeText, foldLine, nextDay } from '../src/ics.js';
import { taskEvent } from '../src/routes/calendar.js';

describe('iCalendar writer (US-33)', () => {
  it('escapes text values', () => {
    expect(escapeText('a,b;c\\d\nzwei')).toBe('a\\,b\\;c\\\\d\\nzwei');
  });

  it('folds lines at 75 bytes without splitting a character', () => {
    const line = 'SUMMARY:' + 'ä'.repeat(60);
    const folded = foldLine(line);
    for (const part of folded.split('\r\n')) expect(Buffer.byteLength(part, 'utf8')).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(line);
    expect(foldLine('kurz')).toBe('kurz');
  });

  it('counts the end of an all-day event as the next day, also across months and years', () => {
    expect(nextDay('2026-11-30')).toBe('2026-12-01');
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
    expect(nextDay('2028-02-28')).toBe('2028-02-29');
  });

  it('writes a calendar with CRLF line ends', () => {
    const ics = buildCalendar({
      name: 'Scrumbanize',
      now: new Date('2026-11-06T12:00:00.000Z'),
      events: [{ uid: 'task-1@scrumbanize', start: '2026-11-20', end: '2026-11-20', summary: 'Test' }],
    });
    expect(ics).toContain('\r\nDTSTAMP:20261106T120000Z\r\n');
    expect(ics.split('\r\n').at(-1)).toBe('');
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n');
  });
});

describe('taskEvent', () => {
  const task = {
    id: 7,
    projectId: 2,
    projectName: 'Haus',
    title: 'Streichen',
    startDate: null,
    dueDate: null,
    priority: null,
    done: false,
    updatedAt: '2026-11-01T10:00:00.000Z',
  };

  it('spans from start to due date, or sits on the one date there is', () => {
    expect(taskEvent({ ...task, startDate: '2026-11-02', dueDate: '2026-11-05' }, 'https://x')).toMatchObject({ start: '2026-11-02', end: '2026-11-05' });
    expect(taskEvent({ ...task, dueDate: '2026-11-05' }, 'https://x')).toMatchObject({ start: '2026-11-05', end: '2026-11-05' });
    expect(taskEvent({ ...task, startDate: '2026-11-02' }, 'https://x')).toMatchObject({ start: '2026-11-02', end: '2026-11-02' });
    // A start after the due date: on the due date alone.
    expect(taskEvent({ ...task, startDate: '2026-11-09', dueDate: '2026-11-05' }, 'https://x')).toMatchObject({ start: '2026-11-05', end: '2026-11-05' });
  });

  it('marks done tasks and links to the task', () => {
    const event = taskEvent({ ...task, dueDate: '2026-11-05', done: true }, 'https://scrumbanize.example');
    expect(event.summary).toBe('✓ Streichen');
    expect(event.url).toBe('https://scrumbanize.example/p/2/tasks/7');
    expect(event.description).toContain('Erledigt');
  });
});

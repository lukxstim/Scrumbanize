import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { describeChanges, formatDateValue } from '../src/activityText.js';
import { createApp } from '../src/app.js';
import { migrations, openDatabase, type Db } from '../src/database.js';
import { mergeChanges } from '../src/repositories/activityRepository.js';

let db: Db;
let api: ReturnType<typeof request>;

beforeEach(() => {
  db = openDatabase(':memory:');
  api = request(createApp(db));
});

afterEach(() => {
  db.close();
});

const createTask = (body: Record<string, unknown>) => api.post('/api/projects/1/tasks').send({ title: 'T', description: '', ...body });
const patch = (id: number, body: Record<string, unknown>) => api.patch(`/api/tasks/${id}`).send(body);
const taskDescriptions = async () =>
  ((await api.get('/api/projects/1/activities?type=task')).body.items as { description: string }[]).map((a) => a.description);
const ageEntries = () => db.prepare(`UPDATE activities SET created_at = '2000-01-01T00:00:00.000Z'`).run();

describe('priority and dates', () => {
  it('defaults to no priority and no dates', async () => {
    const task = (await createTask({})).body;
    expect(task).toMatchObject({ priority: null, startDate: null, dueDate: null });
  });

  it('creates a task with priority and dates and returns them on the board', async () => {
    const res = await createTask({ priority: 'high', startDate: '2026-10-12', dueDate: '2026-10-16' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ priority: 'high', startDate: '2026-10-12', dueDate: '2026-10-16' });
    const board = (await api.get('/api/projects/1/board')).body;
    expect(board.tasks[0]).toMatchObject({ priority: 'high', startDate: '2026-10-12', dueDate: '2026-10-16' });
  });

  it('rejects invalid values on create', async () => {
    for (const body of [
      { priority: 'critical' },
      { dueDate: '2026-02-30' },
      { dueDate: '17.10.2026' },
      { dueDate: '2026-10-17T10:00' },
      { startDate: '2026-10-12' },
      { startDate: '2026-10-20', dueDate: '2026-10-16' },
    ]) {
      expect((await createTask(body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it('sets, keeps and clears values on PATCH', async () => {
    const task = (await createTask({})).body;
    expect((await patch(task.id, { priority: 'urgent', dueDate: '2026-10-20' })).body).toMatchObject({
      priority: 'urgent',
      startDate: null,
      dueDate: '2026-10-20',
    });
    // Undefined keeps the stored values; the start is checked against the stored due date.
    expect((await patch(task.id, { startDate: '2026-10-18' })).body).toMatchObject({
      priority: 'urgent',
      startDate: '2026-10-18',
      dueDate: '2026-10-20',
    });
    expect((await patch(task.id, { title: 'Neu' })).body).toMatchObject({ title: 'Neu', priority: 'urgent', dueDate: '2026-10-20' });
    // Moving the whole range (as the calendar does) in one request.
    expect((await patch(task.id, { startDate: '2026-10-25', dueDate: '2026-10-27' })).body).toMatchObject({
      startDate: '2026-10-25',
      dueDate: '2026-10-27',
    });
    expect((await patch(task.id, { priority: null, startDate: null, dueDate: null })).body).toMatchObject({
      priority: null,
      startDate: null,
      dueDate: null,
    });
  });

  it('rejects PATCHes that break the start/due rule against stored values', async () => {
    const task = (await createTask({ startDate: '2026-10-12', dueDate: '2026-10-16' })).body;
    const removeDue = await patch(task.id, { dueDate: null });
    expect(removeDue.status).toBe(400);
    expect(removeDue.body.error.code).toBe('invalid_schedule');
    expect((await patch(task.id, { dueDate: '2026-10-10' })).status).toBe(400);
    expect((await patch(task.id, { dueDate: 'morgen' })).status).toBe(400);
    expect((await api.get(`/api/tasks/${task.id}`)).body).toMatchObject({ startDate: '2026-10-12', dueDate: '2026-10-16' });
    expect((await patch(999, { priority: 'low' })).status).toBe(404);
  });
});

describe('activity log', () => {
  it('logs priority and date changes with their new values, the latest value winning', async () => {
    const task = (await createTask({ title: 'Folien' })).body;
    ageEntries();
    await patch(task.id, { priority: 'high', dueDate: '2026-10-17' });
    await patch(task.id, { dueDate: '2026-10-20' });
    await patch(task.id, { title: 'Folien' }); // unchanged, not logged

    expect((await taskDescriptions())[0]).toBe('Task „Folien“ bearbeitet (Priorität: Hoch, Fällig: 20.10.2026)');

    ageEntries();
    await patch(task.id, { priority: null, dueDate: null });
    expect((await taskDescriptions())[0]).toBe('Task „Folien“ bearbeitet (Priorität: keine, Fällig: entfernt)');
  });

  it('formats and merges values', () => {
    expect(formatDateValue('2026-01-05')).toBe('05.01.2026');
    expect(formatDateValue(null)).toBe('entfernt');
    expect(
      describeChanges({ fields: ['description', 'startDate'], tagsAdded: [], tagsRemoved: [], values: { startDate: '12.10.2026' } }),
    ).toBe('Beschreibung, Start: 12.10.2026');
    expect(
      mergeChanges(
        { fields: ['dueDate'], tagsAdded: [], tagsRemoved: [], values: { dueDate: '17.10.2026' } },
        { fields: ['priority', 'dueDate'], tagsAdded: [], tagsRemoved: [], values: { priority: 'Hoch', dueDate: '20.10.2026' } },
      ),
    ).toEqual({ fields: ['dueDate', 'priority'], tagsAdded: [], tagsRemoved: [], values: { dueDate: '20.10.2026', priority: 'Hoch' } });
  });
});

describe('migration', () => {
  it('adds empty priority and date columns to a version 6 database', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumbanize-'));
    const file = path.join(dir, 'v6.db');
    let upgraded: Db | undefined;
    try {
      const v6 = new Database(file);
      for (const sql of migrations.slice(0, 6)) v6.exec(sql);
      v6.pragma('user_version = 6');
      v6.exec(`INSERT INTO tasks (project_id, column_id, lane_id, title, position, created_at, updated_at)
               VALUES (1, 1, 1, 'Alt', 1, 'c', 'u')`);
      v6.close();

      upgraded = openDatabase(file);
      expect(upgraded.pragma('user_version', { simple: true })).toBe(migrations.length);
      expect(upgraded.prepare(`SELECT title, priority, start_date, due_date FROM tasks`).all()).toEqual([
        { title: 'Alt', priority: null, start_date: null, due_date: null },
      ]);
      expect(() => upgraded!.exec(`UPDATE tasks SET due_date = '2026-13-01'`)).toThrow(/CHECK/);
      expect(() => upgraded!.exec(`UPDATE tasks SET priority = 'critical'`)).toThrow(/CHECK/);
    } finally {
      upgraded?.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { openDatabase, type Db } from '../src/database.js';

let db: Db;
let api: ReturnType<typeof request>;

beforeEach(() => {
  db = openDatabase(':memory:');
  api = request(createApp(db));
});

afterEach(() => {
  db.close();
});

const createTask = async (title: string, extra: Record<string, unknown> = {}, projectId = 1) =>
  (await api.post(`/api/projects/${projectId}/tasks`).send({ title, description: '', ...extra })).body as { id: number };
const createProject = async (name: string) => (await api.post('/api/projects').send({ name, color: 'sky' })).body as { id: number };
const board = async (projectId = 1) =>
  (await api.get(`/api/projects/${projectId}/board`)).body as { columns: { id: number; position: number }[]; lanes: { id: number }[] };
const due = async (date: string) => (await api.get(`/api/reminders/due?date=${date}`)).body as { id: number; title: string }[];
const dueTitles = async (date: string) => (await due(date)).map((t) => t.title);

async function moveToColumn(taskId: number, columnIndex: number, projectId = 1) {
  const b = await board(projectId);
  const columns = [...b.columns].sort((a, c) => a.position - c.position);
  await api.post(`/api/tasks/${taskId}/move`).send({ columnId: columns.at(columnIndex)!.id, laneId: b.lanes[0]!.id, index: 0 });
}

describe('GET /api/reminders/due', () => {
  it('returns open tasks due on the day or earlier, with project and priority', async () => {
    await createTask('Heute', { dueDate: '2026-10-18', priority: 'low' });
    await createTask('Gestern', { dueDate: '2026-10-17' });
    await createTask('Morgen', { dueDate: '2026-10-19' });
    await createTask('Ohne Datum');

    const res = await api.get('/api/reminders/due?date=2026-10-18');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: expect.any(Number), projectId: 1, projectName: 'Allgemein', title: 'Gestern', dueDate: '2026-10-17', priority: null },
      { id: expect.any(Number), projectId: 1, projectName: 'Allgemein', title: 'Heute', dueDate: '2026-10-18', priority: 'low' },
    ]);
  });

  it('orders by due date, then priority, then age', async () => {
    await createTask('Niedrig', { dueDate: '2026-10-18', priority: 'low' });
    await createTask('Ohne', { dueDate: '2026-10-18' });
    await createTask('Dringend', { dueDate: '2026-10-18', priority: 'urgent' });
    await createTask('Alt', { dueDate: '2026-10-01' });
    await createTask('Hoch', { dueDate: '2026-10-18', priority: 'high' });
    expect(await dueTitles('2026-10-18')).toEqual(['Alt', 'Dringend', 'Hoch', 'Niedrig', 'Ohne']);
  });

  it('leaves out tasks in the last ("done") column, but not in the columns before it', async () => {
    const done = await createTask('Erledigt', { dueDate: '2026-10-18' });
    const review = await createTask('Im Review', { dueDate: '2026-10-18' });
    await moveToColumn(done.id, -1);
    await moveToColumn(review.id, -2);
    expect(await dueTitles('2026-10-18')).toEqual(['Im Review']);

    // A new column at the end makes the former last column an ordinary one.
    await api.post('/api/projects/1/columns').send({ name: 'Archiv' });
    expect(await dueTitles('2026-10-18')).toEqual(['Erledigt', 'Im Review']);
  });

  it('includes tasks of all projects, but none from the trash', async () => {
    const other = await createProject('Privat');
    await createTask('Steuer', { dueDate: '2026-10-10' }, other.id);
    const trashed = await createTask('Gelöscht', { dueDate: '2026-10-10' });
    expect(await due('2026-10-18')).toMatchObject([
      { title: 'Steuer', projectId: other.id, projectName: 'Privat' },
      { title: 'Gelöscht', projectId: 1 },
    ]);

    await api.delete(`/api/tasks/${trashed.id}`);
    expect(await dueTitles('2026-10-18')).toEqual(['Steuer']);
    await api.delete(`/api/projects/${other.id}`);
    expect(await due('2026-10-18')).toEqual([]);
  });

  it('rejects a missing or invalid date', async () => {
    for (const query of ['', '?date=', '?date=18.10.2026', '?date=2026-02-30', '?date=2026-10-18T10:00']) {
      expect((await api.get(`/api/reminders/due${query}`)).status, query).toBe(400);
    }
  });
});

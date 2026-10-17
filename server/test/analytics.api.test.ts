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

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** A new project (so its log starts with "created") with the five standard columns. */
async function newProject() {
  const project = (await api.post('/api/projects').send({ name: 'Analyse', color: 'sky' })).body as { id: number };
  const board = (await api.get(`/api/projects/${project.id}/board`)).body as {
    columns: { id: number; name: string }[];
    lanes: { id: number }[];
  };
  const column = (name: string) => board.columns.find((c) => c.name === name)!.id;
  const createTask = async (title: string) => (await api.post(`/api/projects/${project.id}/tasks`).send({ title, description: '' })).body.id as number;
  const move = (taskId: number, name: string) =>
    api.post(`/api/tasks/${taskId}/move`).send({ columnId: column(name), laneId: board.lanes[0]!.id, index: 0 });
  return { id: project.id, column, createTask, move };
}

const report = async (projectId: number, query = '') => (await api.get(`/api/projects/${projectId}/analytics${query}`)).body;

/** Sets the time of a task's log entries of one kind, oldest first. */
function setEntryTimes(taskId: number, action: string, times: string[]) {
  const ids = db
    .prepare<[number, string], { id: number }>(`SELECT id FROM activities WHERE entity_id = ? AND entity_type = 'task' AND action_type = ? ORDER BY id`)
    .all(taskId, action);
  ids.forEach((row, i) => db.prepare(`UPDATE activities SET created_at = ? WHERE id = ?`).run(times[i]!, row.id));
}

describe('GET /api/projects/:projectId/analytics', () => {
  it('counts every arrival in Done, including reopened and trashed tasks', async () => {
    const p = await newProject();
    const a = await p.createTask('A');
    const b = await p.createTask('B');
    await p.move(a, 'Done');
    await p.move(a, 'In Progress');
    await p.move(a, 'Done');
    await p.move(b, 'Done');
    await api.delete(`/api/tasks/${b}`);

    const body = await report(p.id, '?tz=Europe/Berlin');
    expect(body.doneColumn).toEqual({ id: p.column('Done'), name: 'Done' });
    expect(body.totals).toEqual({ completed: 3, created: 2 });
    expect(body.completions.map((c: { taskId: number; live: boolean }) => [c.taskId, c.live])).toEqual([
      [a, true],
      [a, true],
      [b, false],
    ]);
    expect(body.velocity).toHaveLength(12);
    expect(body.velocity.at(-1)).toMatchObject({ completed: 3, created: 2 });
    expect(body.range).toMatchObject({ granularity: 'week', timeZone: 'Europe/Berlin' });

    // The trash entry now names its column by id, too.
    const trashed = db.prepare(`SELECT metadata FROM activities WHERE action_type = 'delete' AND entity_id = ?`).get(b) as { metadata: string };
    expect(JSON.parse(trashed.metadata)).toMatchObject({ column: 'Done', columnId: p.column('Done') });
  });

  it('times lead and cycle time and buckets them by week', async () => {
    const p = await newProject();
    const a = await p.createTask('A');
    await p.move(a, 'In Progress');
    await p.move(a, 'Done');
    db.prepare(`UPDATE activities SET created_at = '2026-09-01T08:00:00.000Z' WHERE project_id = ?`).run(p.id);
    db.prepare(`UPDATE tasks SET created_at = '2026-09-01T08:00:00.000Z' WHERE id = ?`).run(a);
    setEntryTimes(a, 'move', ['2026-09-02T08:00:00.000Z', '2026-09-04T08:00:00.000Z']);

    const body = await report(p.id, '?from=2026-08-20&to=2026-09-10&tz=UTC');
    expect(body.range).toEqual({ from: '2026-08-17', to: '2026-09-13', granularity: 'week', timeZone: 'UTC' });
    expect(body.coverageStart).toBe('2026-09-01T08:00:00.000Z');
    expect(body.velocity).toEqual([
      { start: '2026-08-17', completed: null, created: null },
      { start: '2026-08-24', completed: null, created: null },
      { start: '2026-08-31', completed: 1, created: 1 },
      { start: '2026-09-07', completed: 0, created: 0 },
    ]);
    expect(body.leadTime).toEqual({ count: 1, medianMs: 3 * DAY, p85Ms: 3 * DAY, meanMs: 3 * DAY });
    expect(body.cycleTime).toMatchObject({ count: 1, medianMs: 2 * DAY });

    const monthly = await report(p.id, '?from=2026-09-01&to=2026-09-30&granularity=month');
    expect(monthly.velocity).toEqual([{ start: '2026-09-01', completed: 1, created: 1 }]);
  });

  it('finds WIP breaches, also when a limit is lowered below the current count', async () => {
    const p = await newProject();
    for (const title of ['A', 'B', 'C']) await p.move(await p.createTask(title), 'In Progress');
    await api.patch(`/api/columns/${p.column('In Progress')}`).send({ wipLimit: 2 });
    const now = Date.now();
    db.prepare(`UPDATE activities SET created_at = ? WHERE project_id = ?`).run(new Date(now - 2 * HOUR).toISOString(), p.id);
    db.prepare(`UPDATE activities SET created_at = ? WHERE entity_type = 'board'`).run(new Date(now - HOUR).toISOString());

    const { wip } = await report(p.id);
    expect(wip).toHaveLength(1);
    expect(wip[0]).toMatchObject({ name: 'In Progress', exists: true, wipLimit: 2, episodes: 1, peakOver: 1 });
    expect(wip[0].overLimitMs).toBeGreaterThanOrEqual(HOUR);
    expect(wip[0].overLimitMs).toBeLessThan(HOUR + 60_000);
    // Project and tasks were created at the same instant, so the series starts with three tasks.
    expect(wip[0].series.map((s: { count: number; limit: number }) => [s.count, s.limit])).toEqual([
      [3, 3],
      [3, 2],
      [3, 2],
    ]);
  });

  it('shows no figures for a project whose log is empty', async () => {
    // "Allgemein" comes from a migration and has no log entries.
    const body = await report(1);
    expect(body.coverageStart).toBeNull();
    expect(body.velocity.every((b: { completed: number | null }) => b.completed === null)).toBe(true);
    expect(body.wip).toEqual([]);
  });

  it('rejects unknown projects and invalid parameters', async () => {
    expect((await api.get('/api/projects/999/analytics')).status).toBe(404);
    for (const query of ['tz=Mars/Olympus', 'from=2026-09-10&to=2026-09-01', 'from=2020-01-01&to=2026-01-01', 'granularity=day', 'from=2026-02-30']) {
      const res = await api.get(`/api/projects/1/analytics?${query}`);
      expect(res.status, query).toBe(400);
      expect(res.body.error.code).toBe('invalid_input');
    }
  });
});

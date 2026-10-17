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

interface Label {
  id: number;
  name: string;
  color: string;
}

/** A new project, which starts with the starter labels. */
async function newProject(name = 'Labels') {
  const project = (await api.post('/api/projects').send({ name, color: 'sky' })).body as { id: number };
  const board = (await api.get(`/api/projects/${project.id}/board`)).body as {
    columns: { id: number; name: string }[];
    lanes: { id: number }[];
    labels: Label[];
  };
  const label = (n: string) => board.labels.find((l) => l.name === n)!;
  return { id: project.id, board, label };
}
const activities = async (projectId: number) =>
  ((await api.get(`/api/projects/${projectId}/activities`)).body.items as { description: string }[]).map((a) => a.description);

describe('labels', () => {
  it('gives new projects the starter labels, without log entries of their own', async () => {
    const p = await newProject();
    expect(p.board.labels.map((l) => [l.name, l.color])).toEqual([
      ['Bug', 'red'],
      ['Feature', 'sky'],
      ['Dringend', 'amber'],
    ]);
    expect(await activities(p.id)).toEqual(['Projekt „Labels“ angelegt']);
    // Projects from before (here "Allgemein" from the migration) have none.
    expect((await api.get('/api/projects/1/labels')).body).toEqual([]);
  });

  it('creates, renames, recolors, reorders and deletes labels, and logs it', async () => {
    const p = await newProject();
    const created = await api.post(`/api/projects/${p.id}/labels`).send({ name: 'Einkauf', color: 'emerald' });
    expect(created.status).toBe(201);
    expect((await api.post(`/api/projects/${p.id}/labels`).send({ name: 'einkauf', color: 'red' })).status).toBe(409);
    expect((await api.post(`/api/projects/${p.id}/labels`).send({ name: 'X', color: 'gold' })).status).toBe(400);

    await api.patch(`/api/labels/${created.body.id}`).send({ name: 'Shopping', color: 'pink' });
    await api.post(`/api/labels/${created.body.id}/move`).send({ index: 0 });
    expect(((await api.get(`/api/projects/${p.id}/labels`)).body as Label[]).map((l) => l.name)).toEqual(['Shopping', 'Bug', 'Feature', 'Dringend']);

    expect((await api.delete(`/api/labels/${created.body.id}`)).status).toBe(204);
    expect((await api.delete(`/api/labels/${created.body.id}`)).status).toBe(404);
    expect(await activities(p.id)).toEqual([
      'Label „Shopping“ gelöscht',
      'Farbe von Label „Shopping“ geändert',
      'Label „Einkauf“ in „Shopping“ umbenannt',
      'Label „Einkauf“ angelegt',
      'Projekt „Labels“ angelegt',
    ]);
  });

  it('assigns labels to tasks, logs the changes and removes them with the label', async () => {
    const p = await newProject();
    const task = (
      await api.post(`/api/projects/${p.id}/tasks`).send({ title: 'Absturz', description: '', labelIds: [p.label('Bug').id, p.label('Dringend').id] })
    ).body as { id: number; labels: Label[] };
    expect(task.labels.map((l) => l.name)).toEqual(['Bug', 'Dringend']);

    db.prepare(`UPDATE activities SET created_at = '2000-01-01T00:00:00.000Z'`).run();
    const updated = await api.patch(`/api/tasks/${task.id}`).send({ labelIds: [p.label('Bug').id, p.label('Feature').id] });
    expect(updated.body.labels.map((l: Label) => l.name)).toEqual(['Bug', 'Feature']);
    expect((await activities(p.id))[0]).toBe('Task „Absturz“ bearbeitet (Labels +Feature −Dringend)');

    expect((await api.get(`/api/labels/${p.label('Bug').id}/usage`)).body).toEqual({ tasks: 1 });
    await api.delete(`/api/labels/${p.label('Bug').id}`);
    expect((await activities(p.id))[0]).toBe('Label „Bug“ gelöscht (von 1 Task entfernt)');
    expect((await api.get(`/api/tasks/${task.id}`)).body.labels.map((l: Label) => l.name)).toEqual(['Feature']);
  });

  it('refuses labels, columns and lanes of other projects', async () => {
    const a = await newProject('A');
    const b = await newProject('B');
    const foreign = b.label('Bug').id;
    expect((await api.post(`/api/projects/${a.id}/tasks`).send({ title: 'X', description: '', labelIds: [foreign] })).status).toBe(400);
    expect((await api.post(`/api/projects/${a.id}/tasks`).send({ title: 'X', description: '', columnId: b.board.columns[0]!.id })).status).toBe(400);
    const task = (await api.post(`/api/projects/${a.id}/tasks`).send({ title: 'X', description: '' })).body;
    expect((await api.patch(`/api/tasks/${task.id}`).send({ labelIds: [foreign] })).status).toBe(400);
  });

  it('creates tasks in a chosen column and shows labels in graph, search and CSV', async () => {
    const p = await newProject();
    const review = p.board.columns.find((c) => c.name === 'Review')!.id;
    const task = (await api.post(`/api/projects/${p.id}/tasks`).send({ title: 'Prüfen', description: '', columnId: review, labelIds: [p.label('Feature').id] }))
      .body;
    expect(task.columnId).toBe(review);
    const graph = (await api.get(`/api/projects/${p.id}/graph`)).body;
    expect(graph.nodes[0]).toMatchObject({ labels: [{ name: 'Feature', color: 'sky' }] });
    const search = (await api.get(`/api/search?q=feature&project=${p.id}`)).body;
    expect(search.tasks.map((t: { title: string }) => t.title)).toEqual(['Prüfen']);
    expect((await api.get(`/api/projects/${p.id}/export/board.csv`)).text.split('\r\n')[1]).toMatch(/^\d+;Prüfen;Review;Standard;nein;;Feature;/);
  });
});

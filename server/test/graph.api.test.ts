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

const createNote = async (title: string, tags: string[] = [], projectId = 1) =>
  (await api.post(`/api/projects/${projectId}/notes`).send({ title, content: 'Inhalt', tags })).body.id as number;
const createTask = async (title: string, sourceNoteId?: number, projectId = 1) =>
  (await api.post(`/api/projects/${projectId}/tasks`).send({ title, description: '', sourceNoteId })).body.id as number;
const link = (id: number, targetId: number, kind: string) => api.post(`/api/tasks/${id}/links`).send({ targetId, kind });

interface Graph {
  nodes: { id: string; type: string; title: string; done?: boolean; tags?: string[] }[];
  edges: { source: string; target: string; kind: string }[];
}
const graph = async (projectId = 1): Promise<Graph> => (await api.get(`/api/projects/${projectId}/graph`)).body;

describe('GET /api/projects/:projectId/graph', () => {
  it('lists notes and tasks with their connections', async () => {
    const meeting = await createNote('Meeting', ['team', 'q4']);
    await createNote('Lose Idee');
    const a = await createTask('A', meeting);
    const b = await createTask('B');
    const c = await createTask('C');
    expect((await link(a, b, 'blocks')).status).toBe(201);
    expect((await link(c, b, 'blocked_by')).status).toBe(201); // stored as b blocks c
    expect((await link(a, c, 'relates')).status).toBe(201);

    const { nodes, edges } = await graph();
    expect(nodes.map((n) => [n.id, n.type, n.title])).toEqual([
      [`note:${meeting}`, 'note', 'Meeting'],
      [expect.stringMatching(/^note:/), 'note', 'Lose Idee'],
      [`task:${a}`, 'task', 'A'],
      [`task:${b}`, 'task', 'B'],
      [`task:${c}`, 'task', 'C'],
    ]);
    expect(nodes[0]).toMatchObject({ tags: ['q4', 'team'] });
    expect(nodes[2]).toMatchObject({ columnName: 'Backlog', done: false, priority: null });
    expect(edges).toEqual([
      { source: `note:${meeting}`, target: `task:${a}`, kind: 'converted' },
      { source: `task:${a}`, target: `task:${b}`, kind: 'blocks' },
      { source: `task:${b}`, target: `task:${c}`, kind: 'blocks' },
      { source: `task:${a}`, target: `task:${c}`, kind: 'relates' },
    ]);
  });

  it('marks tasks in the last column as done', async () => {
    const id = await createTask('Fertig');
    const board = (await api.get('/api/projects/1/board')).body;
    await api.post(`/api/tasks/${id}/move`).send({ columnId: board.columns.at(-1).id, laneId: board.lanes[0].id, index: 0 });
    expect((await graph()).nodes[0]).toMatchObject({ done: true, columnName: 'Done' });
  });

  it('leaves out the trash and edges to it', async () => {
    const note = await createNote('Notiz');
    const a = await createTask('A', note);
    const b = await createTask('B');
    await link(a, b, 'relates');

    await api.delete(`/api/notes/${note}`);
    let result = await graph();
    expect(result.nodes.map((n) => n.title)).toEqual(['A', 'B']);
    expect(result.edges.map((e) => e.kind)).toEqual(['relates']);

    await api.delete(`/api/tasks/${b}`);
    result = await graph();
    expect(result.nodes.map((n) => n.title)).toEqual(['A']);
    expect(result.edges).toEqual([]);
  });

  it('only shows the requested project', async () => {
    const other = (await api.post('/api/projects').send({ name: 'Anderes', color: 'red' })).body.id as number;
    await createNote('Hier');
    await createNote('Dort', [], other);
    expect((await graph()).nodes.map((n) => n.title)).toEqual(['Hier']);
    expect((await graph(other)).nodes.map((n) => n.title)).toEqual(['Dort']);
    expect((await api.get('/api/projects/999/graph')).status).toBe(404);
  });
});

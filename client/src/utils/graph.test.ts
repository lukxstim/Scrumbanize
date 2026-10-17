import { describe, expect, it } from 'vitest';
import type { GraphData } from '../types/graph';
import { degrees, filterGraph, isGraphFilter, neighborhood, nodePath, searchGraph, DEFAULT_GRAPH_FILTER } from './graph';

const graph: GraphData = {
  nodes: [
    { id: 'note:1', type: 'note', entityId: 1, title: 'Meeting', tags: ['team'] },
    { id: 'note:2', type: 'note', entityId: 2, title: 'Idee', tags: [] },
    { id: 'task:1', type: 'task', entityId: 1, title: 'Agenda', columnName: 'To Do', done: false, priority: null, labels: [] },
    { id: 'task:2', type: 'task', entityId: 2, title: 'Protokoll', columnName: 'Done', done: true, priority: 'high', labels: [{ name: 'Bug', color: 'red' }] },
    { id: 'task:3', type: 'task', entityId: 3, title: 'Allein', columnName: 'Backlog', done: false, priority: null, labels: [] },
  ],
  edges: [
    { source: 'note:1', target: 'task:1', kind: 'converted' },
    { source: 'task:1', target: 'task:2', kind: 'blocks' },
  ],
};
const ids = (data: GraphData) => data.nodes.map((n) => n.id);

describe('filterGraph', () => {
  it('keeps everything by default', () => {
    expect(filterGraph(graph, DEFAULT_GRAPH_FILTER)).toEqual(graph);
  });

  it('drops done tasks with their edges, and nodes left without connections', () => {
    const noDone = filterGraph(graph, { ...DEFAULT_GRAPH_FILTER, done: false });
    expect(ids(noDone)).toEqual(['note:1', 'note:2', 'task:1', 'task:3']);
    expect(noDone.edges).toHaveLength(1);

    expect(ids(filterGraph(graph, { ...DEFAULT_GRAPH_FILTER, isolated: false }))).toEqual(['note:1', 'task:1', 'task:2']);
    // Without notes, the first task is still connected to the second.
    expect(ids(filterGraph(graph, { ...DEFAULT_GRAPH_FILTER, notes: false, isolated: false }))).toEqual(['task:1', 'task:2']);
    expect(ids(filterGraph(graph, { ...DEFAULT_GRAPH_FILTER, tasks: false }))).toEqual(['note:1', 'note:2']);
  });

  it('checks stored filters', () => {
    expect(isGraphFilter(DEFAULT_GRAPH_FILTER)).toBe(true);
    expect(isGraphFilter({ notes: true })).toBe(false);
    expect(isGraphFilter(null)).toBe(false);
  });
});

describe('neighbors, degrees and search', () => {
  it('counts connections and finds neighbors', () => {
    expect(Object.fromEntries(degrees(graph))).toEqual({ 'note:1': 1, 'note:2': 0, 'task:1': 2, 'task:2': 1, 'task:3': 0 });
    expect([...neighborhood(graph, 'task:1')].sort()).toEqual(['note:1', 'task:1', 'task:2']);
  });

  it('searches titles, note tags and task columns', () => {
    expect([...searchGraph(graph.nodes, 'team')]).toEqual(['note:1']);
    expect([...searchGraph(graph.nodes, 'proto')]).toEqual(['task:2']);
    expect([...searchGraph(graph.nodes, 'backlog')]).toEqual(['task:3']);
    expect([...searchGraph(graph.nodes, 'bug')]).toEqual(['task:2']);
    expect(searchGraph(graph.nodes, '  ').size).toBe(0);
  });

  it('links notes and tasks to their pages', () => {
    expect(nodePath(4, graph.nodes[0]!)).toBe('/p/4/notes/1');
    expect(nodePath(4, graph.nodes[3]!)).toBe('/p/4/tasks/2');
  });
});

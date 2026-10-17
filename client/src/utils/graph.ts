import type { GraphData, GraphNode } from '../types/graph';
import { matchesQuery } from './matchQuery';
import { paths } from './paths';

export interface GraphFilter {
  notes: boolean;
  tasks: boolean;
  /** Tasks in the last column. */
  done: boolean;
  /** Nodes without any connection (after the other filters). */
  isolated: boolean;
}

export const DEFAULT_GRAPH_FILTER: GraphFilter = { notes: true, tasks: true, done: true, isolated: true };

export const isGraphFilter = (value: unknown): value is GraphFilter =>
  typeof value === 'object' &&
  value !== null &&
  (['notes', 'tasks', 'done', 'isolated'] as const).every((key) => typeof (value as Record<string, unknown>)[key] === 'boolean');

/** The nodes and edges the filter keeps; edges only stay while both ends do. */
export function filterGraph(graph: GraphData, filter: GraphFilter): GraphData {
  const kept = graph.nodes.filter((node) =>
    node.type === 'note' ? filter.notes : filter.tasks && (filter.done || !node.done),
  );
  const ids = new Set(kept.map((node) => node.id));
  const edges = graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  if (filter.isolated) return { nodes: kept, edges };
  const connected = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  return { nodes: kept.filter((node) => connected.has(node.id)), edges };
}

/** Number of connections per node. */
export function degrees(graph: GraphData): Map<string, number> {
  const result = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (const edge of graph.edges) {
    result.set(edge.source, (result.get(edge.source) ?? 0) + 1);
    result.set(edge.target, (result.get(edge.target) ?? 0) + 1);
  }
  return result;
}

/** The node and its direct neighbors. */
export function neighborhood(graph: GraphData, id: string): Set<string> {
  const result = new Set([id]);
  for (const edge of graph.edges) {
    if (edge.source === id) result.add(edge.target);
    if (edge.target === id) result.add(edge.source);
  }
  return result;
}

/** Nodes whose title (or, for notes, a tag) matches the search; empty for an empty search. */
export function searchGraph(nodes: GraphNode[], query: string): Set<string> {
  if (!query.trim()) return new Set();
  return new Set(
    nodes
      .filter((node) => matchesQuery(query, node.title, ...(node.type === 'note' ? node.tags : [node.columnName, ...node.labels.map((l) => l.name)])))
      .map((n) => n.id),
  );
}

/** Where a click on the node leads: the note in the notes area, or the task's details on the board. */
export function nodePath(projectId: number, node: GraphNode): string {
  return node.type === 'note' ? paths.notes(projectId, node.entityId) : paths.task(projectId, node.entityId);
}

/** Radius of a node, growing gently with its connections. */
export const nodeRadius = (degree: number) => 4 + Math.min(6, Math.sqrt(degree) * 1.6);

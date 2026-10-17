import type { ProjectColor } from './project';
import type { TaskPriority } from './task';

/** Mirrors server/src/repositories/graphRepository.ts. Node ids are "note:12" or "task:7". */
export type GraphNode =
  | { id: string; type: 'note'; entityId: number; title: string; tags: string[] }
  | {
      id: string;
      type: 'task';
      entityId: number;
      title: string;
      columnName: string;
      /** In the project's last column. */
      done: boolean;
      priority: TaskPriority | null;
      labels: { name: string; color: ProjectColor }[];
    };

/** "converted": the task was created from the note. "blocks" points from the blocking to the blocked task. */
export type GraphEdgeKind = 'converted' | 'blocks' | 'relates';

export interface GraphEdge {
  source: string;
  target: string;
  kind: GraphEdgeKind;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

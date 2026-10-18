import type { ContentPlace } from './link';
import type { ProjectColor } from './project';
import type { TaskPriority } from './task';

/** Mirrors server/src/repositories/graphRepository.ts. Node ids are "note:12" or "task:7". */
/** A linked note or task of another project or notebook (US-22). */
type External = { external?: ContentPlace };

export type GraphNode =
  | ({ id: string; type: 'note'; entityId: number; title: string; tags: string[] } & External)
  | ({
      id: string;
      type: 'task';
      entityId: number;
      title: string;
      columnName: string;
      /** In the project's last column. */
      done: boolean;
      priority: TaskPriority | null;
      labels: { name: string; color: ProjectColor }[];
    } & External);

/**
 * "converted": the task was created from the note. "blocks" points from the blocking to the blocked task.
 * "mentions": the source's text links to the target (US-22).
 */
export type GraphEdgeKind = 'converted' | 'blocks' | 'relates' | 'mentions';

export interface GraphEdge {
  source: string;
  target: string;
  kind: GraphEdgeKind;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

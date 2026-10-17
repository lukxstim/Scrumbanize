import ForceGraph from 'force-graph';
import { useEffect, useRef } from 'react';
import type { GraphData, GraphEdgeKind, GraphNode } from '../../types/graph';
import { degrees, neighborhood, nodeRadius } from '../../utils/graph';

type Node = GraphNode & { x?: number; y?: number; vx?: number; vy?: number; fx?: number; fy?: number; degree: number };
type Link = { source: string | Node; target: string | Node; kind: GraphEdgeKind };

interface Palette {
  note: string;
  task: string;
  done: string;
  edge: string;
  label: string;
  match: string;
  surface: string;
}

/** Colors come from the theme's CSS variables, so the canvas follows light and dark mode. */
function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement);
  const get = (name: string) => style.getPropertyValue(name).trim();
  return {
    note: get('--color-chart-1'),
    task: get('--color-chart-2'),
    done: get('--color-fg-faint'),
    edge: get('--color-line-strong'),
    label: get('--color-fg-muted'),
    match: get('--color-accent'),
    surface: get('--color-surface'),
  };
}

const positionsKey = (projectId: number) => `scrumbanize.graphPositions.${projectId}`;

function loadPositions(projectId: number): Record<string, [number, number]> {
  try {
    return JSON.parse(sessionStorage.getItem(positionsKey(projectId)) ?? '{}') as Record<string, [number, number]>;
  } catch {
    return {};
  }
}

/** Zoom level from which all labels are drawn; well-connected nodes (HUB_DEGREE or more) get theirs earlier. */
const LABEL_ZOOM = 1.3;
const HUB_ZOOM = 0.6;
const HUB_DEGREE = 3;

/**
 * A gentle pull towards the center. Without it, nodes without connections only feel the repulsion and drift far
 * out, so fitting the graph into view would make everything tiny.
 */
function gravity(strength: number) {
  let nodes: Node[] = [];
  const force = (alpha: number) => {
    for (const node of nodes) {
      node.vx = (node.vx ?? 0) - (node.x ?? 0) * strength * alpha;
      node.vy = (node.vy ?? 0) - (node.y ?? 0) * strength * alpha;
    }
  };
  force.initialize = (all: Node[]) => {
    nodes = all;
  };
  return force;
}

interface ForceGraphCanvasProps {
  projectId: number;
  data: GraphData;
  /** Search matches: ringed and always labeled. */
  matches: Set<string>;
  onOpen: (node: GraphNode) => void;
  onHover: (node: GraphNode | null) => void;
  /** Called with a function that fits the whole graph into view, for the toolbar's button. */
  onReady: (fit: () => void) => void;
}

/** The force-directed graph on a canvas: zoom, pan and dragging come from force-graph. */
export default function ForceGraphCanvas({ projectId, data, matches, onOpen, onHover, onReady }: ForceGraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraph<Node, Link> | null>(null);
  // Node objects are kept across filter changes, so the simulation's positions stay.
  const nodesRef = useRef(new Map<string, Node>());
  const state = useRef({ hovered: null as string | null, focus: new Set<string>(), matches, palette: readPalette(), data });
  const callbacks = useRef({ onOpen, onHover });
  callbacks.current = { onOpen, onHover };

  // Created once; everything that changes is read from refs, and `redraw` repaints after such changes.
  useEffect(() => {
    const container = containerRef.current!;
    const graph = new ForceGraph<Node, Link>(container);
    graphRef.current = graph;
    const fitted = { done: false };

    function savePositions() {
      const positions: Record<string, [number, number]> = {};
      for (const node of nodesRef.current.values()) {
        if (node.x !== undefined && node.y !== undefined) positions[node.id] = [Math.round(node.x), Math.round(node.y)];
      }
      try {
        sessionStorage.setItem(positionsKey(projectId), JSON.stringify(positions));
      } catch {
        // Positions are a convenience; without storage the layout is simply computed again.
      }
    }

    graph
      .backgroundColor('rgba(0,0,0,0)')
      .minZoom(0.1)
      .maxZoom(8)
      .d3AlphaDecay(0.04)
      .d3VelocityDecay(0.35)
      .cooldownTicks(300)
      .linkColor(() => state.current.palette.edge)
      .linkWidth((link) => (link.kind === 'relates' ? 1 : 1.5))
      .linkDirectionalArrowLength((link) => (link.kind === 'blocks' ? 5 : 0))
      .linkDirectionalArrowRelPos(1)
      .linkVisibility((link) => {
        const { focus } = state.current;
        return focus.size === 0 || (focus.has(idOf(link.source)) && focus.has(idOf(link.target)));
      })
      .nodeCanvasObject((node, ctx, scale) => drawNode(node, ctx, scale, state.current))
      .nodePointerAreaPaint((node, color, ctx) => {
        // A hit area a bit larger than the node, so small nodes are easy to point at.
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(node.x!, node.y!, nodeRadius(node.degree) + 4, 0, 2 * Math.PI);
        ctx.fill();
      })
      .onNodeHover((node) => {
        state.current.hovered = node?.id ?? null;
        state.current.focus = node ? neighborhood(state.current.data, node.id) : new Set();
        container.style.cursor = node ? 'pointer' : '';
        callbacks.current.onHover(node ?? null);
      })
      .onNodeClick((node) => callbacks.current.onOpen(node))
      .onNodeDragEnd(savePositions)
      .onEngineStop(() => {
        savePositions();
        if (!fitted.done) {
          fitted.done = true;
          graph.zoomToFit(400, 48);
        }
      });
    const charge = graph.d3Force('charge');
    charge?.strength?.(-45);
    charge?.distanceMax?.(220);
    graph.d3Force('link')?.distance?.(36);
    graph.d3Force('gravity', gravity(0.08));

    onReady(() => graph.zoomToFit(400, 48));

    const resize = new ResizeObserver(([entry]) => {
      if (entry) graph.width(entry.contentRect.width).height(entry.contentRect.height);
    });
    resize.observe(container);

    // The theme switch sets data-theme on <html>: read the colors again.
    const themeObserver = new MutationObserver(() => {
      state.current.palette = readPalette();
      redraw(graph);
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      resize.disconnect();
      themeObserver.disconnect();
      savePositions();
      graph._destructor();
      graphRef.current = null;
    };
    // The canvas belongs to one project (the page is remounted for another one).
  }, []);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const cached = loadPositions(projectId);
    const degree = degrees(data);
    const known = nodesRef.current;
    let placed = 0;
    const nodes = data.nodes.map((source) => {
      const node: Node = Object.assign(known.get(source.id) ?? {}, source, { degree: degree.get(source.id) ?? 0 });
      if (node.x === undefined && cached[node.id]) [node.x, node.y] = cached[node.id]!;
      if (node.x !== undefined) placed++;
      known.set(node.id, node);
      return node;
    });
    state.current.data = data;
    // With a stored layout, there is little left to compute: a short settle instead of a full warm-up.
    graph.warmupTicks(placed === nodes.length ? 0 : Math.min(120, 20 + nodes.length / 10));
    graph.graphData({ nodes, links: data.edges.map((edge) => ({ ...edge })) });
  }, [data, projectId]);

  useEffect(() => {
    state.current.matches = matches;
    if (graphRef.current) redraw(graphRef.current);
  }, [matches]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      role="img"
      aria-label={`Graph mit ${data.nodes.length} Knoten und ${data.edges.length} Verbindungen. Die Listenansicht zeigt dieselben Inhalte.`}
    />
  );
}

const idOf = (end: string | Node) => (typeof end === 'string' ? end : end.id);

/** Repaints without restarting the simulation (setting an accessor again triggers a redraw). */
function redraw(graph: ForceGraph<Node, Link>) {
  graph.nodeCanvasObject(graph.nodeCanvasObject());
}

function drawNode(
  node: Node,
  ctx: CanvasRenderingContext2D,
  scale: number,
  { hovered, focus, matches, palette }: { hovered: string | null; focus: Set<string>; matches: Set<string>; palette: Palette },
) {
  const x = node.x!;
  const y = node.y!;
  const r = nodeRadius(node.degree);
  const dimmed = (focus.size > 0 && !focus.has(node.id)) || (matches.size > 0 && !matches.has(node.id) && !focus.has(node.id));
  const isDone = node.type === 'task' && node.done;
  ctx.globalAlpha = dimmed ? 0.15 : isDone ? 0.55 : 1;

  // Shape tells the type, not just color: notes are circles, tasks rounded squares.
  ctx.beginPath();
  if (node.type === 'note') ctx.arc(x, y, r, 0, 2 * Math.PI);
  else ctx.roundRect(x - r, y - r, 2 * r, 2 * r, r * 0.35);
  ctx.fillStyle = node.type === 'note' ? palette.note : isDone ? palette.done : palette.task;
  ctx.fill();
  // A ring in the surface color keeps overlapping nodes apart.
  ctx.lineWidth = 1.5 / scale;
  ctx.strokeStyle = palette.surface;
  ctx.stroke();

  const matched = matches.has(node.id);
  if (matched || hovered === node.id) {
    ctx.beginPath();
    ctx.arc(x, y, r + 3 / scale + 1, 0, 2 * Math.PI);
    ctx.lineWidth = 2 / scale;
    ctx.strokeStyle = palette.match;
    ctx.stroke();
  }

  const hub = node.degree >= HUB_DEGREE && scale >= HUB_ZOOM;
  if (scale >= LABEL_ZOOM || hub || matched || (focus.size > 0 && focus.has(node.id))) {
    const fontSize = 11 / scale;
    ctx.font = `${hovered === node.id ? 600 : 400} ${fontSize}px 'Inter Variable', system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const title = node.title || (node.type === 'note' ? 'Unbenannte Notiz' : 'Ohne Titel');
    const label = title.length > 40 ? `${title.slice(0, 39)}…` : title;
    // A halo in the surface color keeps labels readable over edges.
    ctx.lineWidth = 3 / scale;
    ctx.strokeStyle = palette.surface;
    ctx.strokeText(label, x, y + r + 3 / scale);
    ctx.fillStyle = palette.label;
    ctx.fillText(label, x, y + r + 3 / scale);
  }
  ctx.globalAlpha = 1;
}

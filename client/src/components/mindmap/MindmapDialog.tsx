import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useToast } from '../../hooks/useToast';
import { exportFileName, hasOutline, noteToMindmap, type MindmapNode } from '../../utils/mindmap';
import { CHECKBOX_SPACE, layoutMindmap, linkPath, ROOT_PADDING, type MindmapLayout, type PlacedNode } from '../../utils/mindmapLayout';
import { downloadBlob, serializeSvg, svgToPng } from '../../utils/svgExport';
import { DownloadIcon, FitIcon, MindmapIcon } from '../icons';
import Button from '../ui/Button';
import Dialog from '../ui/Dialog';

const FONT_FAMILY = "'Inter Variable', system-ui, sans-serif";
const font = (node: MindmapNode) =>
  node.kind === 'root' ? `600 14px ${FONT_FAMILY}` : node.id.split('.').length === 2 ? `600 13px ${FONT_FAMILY}` : `400 12.5px ${FONT_FAMILY}`;
/** Space between a node's text and its underline, which the links run into. */
const UNDERLINE = 6;
const ROOT_HEIGHT = 32;
const EXPORT_PADDING = 32;
const BRANCH_COLORS = 8;

interface Colors {
  branches: string[];
  fallback: string;
  text: string;
  muted: string;
  faint: string;
  surface: string;
  accent: string;
  accentText: string;
  focus: string;
}

/** Concrete colors from the theme, so the exported file looks like the screen. */
function readColors(): Colors {
  const style = getComputedStyle(document.documentElement);
  const get = (name: string) => style.getPropertyValue(name).trim();
  return {
    branches: Array.from({ length: BRANCH_COLORS }, (_, i) => get(`--color-chart-${i + 1}`)),
    fallback: get('--color-fg-faint'),
    text: get('--color-fg'),
    muted: get('--color-fg-muted'),
    faint: get('--color-fg-faint'),
    surface: get('--color-surface'),
    accent: get('--color-accent'),
    accentText: get('--color-accent-fg'),
    focus: get('--color-accent'),
  };
}

function useThemeColors(): Colors {
  const [colors, setColors] = useState(readColors);
  useEffect(() => {
    const observer = new MutationObserver(() => setColors(readColors()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return colors;
}

const canvas = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
function measureText(node: MindmapNode): number {
  if (!canvas) return node.text.length * 7;
  canvas.font = font(node);
  return Math.ceil(canvas.measureText(node.text).width);
}

type Transform = { k: number; x: number; y: number };

interface MindmapDialogProps {
  title: string;
  markdown: string;
  onClose: () => void;
}

/** A note's outline as a mindmap: zoom, pan, collapse branches, export as SVG or PNG. */
export default function MindmapDialog({ title, markdown, onClose }: MindmapDialogProps) {
  const toast = useToast();
  const colors = useThemeColors();
  const root = useMemo(() => noteToMindmap(title, markdown), [title, markdown]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Text is measured with the app's font, so wait until it is loaded.
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    void document.fonts.ready.then(() => setFontsReady(true));
  }, []);
  const layout = useMemo(() => (fontsReady ? layoutMindmap(root, collapsed, measureText) : null), [root, collapsed, fontsReady]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [exporting, setExporting] = useState(false);
  const { transform, fit, handlers, wasDrag } = useZoomPan(svgRef, layout);

  function toggle(node: MindmapNode) {
    if (wasDrag() || node.children.length === 0) return;
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(node.id)) next.delete(node.id);
      else next.add(node.id);
      return next;
    });
  }

  async function exportAs(type: 'svg' | 'png') {
    if (!svgRef.current || !layout) return;
    setExporting(true);
    try {
      const { bounds } = layout;
      const frame = {
        x: bounds.x - EXPORT_PADDING,
        y: bounds.y - EXPORT_PADDING,
        width: bounds.width + 2 * EXPORT_PADDING,
        height: bounds.height + 2 * EXPORT_PADDING,
        background: colors.surface,
      };
      const svg = await serializeSvg(svgRef.current, frame);
      const blob = type === 'svg' ? new Blob([svg], { type: 'image/svg+xml' }) : await svgToPng(svg, frame.width, frame.height);
      downloadBlob(blob, exportFileName(title, type));
    } catch {
      toast({ message: `Die Mindmap konnte nicht als ${type.toUpperCase()} exportiert werden.`, tone: 'error' });
    } finally {
      setExporting(false);
    }
  }

  const outline = hasOutline(root);
  return (
    <Dialog onClose={onClose} labelledBy="mindmap-title" closeOnBackdrop className="flex h-[min(52rem,88vh)] max-w-6xl flex-col overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <MindmapIcon className="size-4 text-fg-subtle" />
        <h2 id="mindmap-title" className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
          Mindmap: {root.text}
        </h2>
        {outline && (
          <>
            <Button size="sm" variant="ghost" onClick={fit}>
              <FitIcon className="size-3.5" />
              Einpassen
            </Button>
            <Button size="sm" disabled={exporting || !layout} onClick={() => void exportAs('svg')}>
              <DownloadIcon className="size-3.5" />
              SVG
            </Button>
            <Button size="sm" disabled={exporting || !layout} onClick={() => void exportAs('png')}>
              <DownloadIcon className="size-3.5" />
              PNG
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" onClick={onClose} data-autofocus>
          Schließen
        </Button>
      </div>

      {outline ? (
        <>
          <svg
            ref={svgRef}
            className="min-h-0 w-full flex-1 cursor-grab touch-none select-none bg-surface active:cursor-grabbing"
            role="tree"
            aria-label={`Mindmap von „${root.text}“`}
            {...handlers}
          >
            {layout && (
              <g data-export-content transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
                <MindmapContent layout={layout} colors={colors} collapsed={collapsed} onToggle={toggle} />
              </g>
            )}
          </svg>
          <p className="border-t border-line px-5 py-2 text-xs text-fg-subtle">
            Klick auf einen Knoten klappt seine Zweige ein und aus · Mausrad oder zwei Finger zoomen · Ziehen verschiebt · Der Export zeigt die
            ganze Mindmap so, wie sie gerade aufgeklappt ist.
          </p>
        </>
      ) : (
        <div className="grid flex-1 place-items-center p-8 text-center">
          <div className="max-w-sm">
            <p className="text-sm font-medium text-fg">Keine Gliederung gefunden</p>
            <p className="mt-1 text-sm text-fg-subtle">
              Eine Mindmap entsteht aus Überschriften (# …) und Listen. Gliedere die Notiz damit, dann erscheint hier ihre Mindmap.
            </p>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function MindmapContent({
  layout,
  colors,
  collapsed,
  onToggle,
}: {
  layout: MindmapLayout;
  colors: Colors;
  collapsed: Set<string>;
  onToggle: (node: MindmapNode) => void;
}) {
  const branchColor = (branch: number) => colors.branches[branch] ?? colors.fallback;
  return (
    <>
      <g fill="none" strokeLinecap="round">
        {layout.links.map((link, i) => (
          <path
            key={i}
            d={linkPath(
              { x: link.from.x, y: link.from.y + (link.depth > 1 ? UNDERLINE : 0) },
              { x: link.to.x, y: link.to.y + UNDERLINE },
            )}
            stroke={branchColor(link.branch)}
            strokeWidth={link.depth === 1 ? 2.5 : 1.75}
          />
        ))}
      </g>
      {layout.nodes.map((placed) => (
        <MindmapNodeView
          key={placed.node.id}
          placed={placed}
          colors={colors}
          color={branchColor(placed.branch)}
          collapsed={collapsed.has(placed.node.id)}
          onToggle={() => onToggle(placed.node)}
        />
      ))}
    </>
  );
}

function MindmapNodeView({
  placed,
  colors,
  color,
  collapsed,
  onToggle,
}: {
  placed: PlacedNode;
  colors: Colors;
  color: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { node, x, y, width, side } = placed;
  const toggleable = node.children.length > 0;
  const level = { 'aria-level': placed.depth + 1 };
  const props = toggleable
    ? {
        ...level,
        role: 'treeitem',
        tabIndex: 0,
        'aria-expanded': !collapsed,
        'aria-label': node.text,
        onClick: onToggle,
        onKeyDown: (event: React.KeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggle();
          }
        },
        className: 'cursor-pointer outline-none [&:focus-visible_.focus-ring]:opacity-100',
      }
    : { ...level, role: 'treeitem', 'aria-label': node.checked === undefined ? node.text : `${node.text} (${node.checked ? 'erledigt' : 'offen'})` };

  if (side === 0) {
    return (
      <g {...props}>
        <rect
          className="focus-ring opacity-0"
          data-export-ignore
          x={-width / 2 - 3}
          y={-ROOT_HEIGHT / 2 - 3}
          width={width + 6}
          height={ROOT_HEIGHT + 6}
          rx={ROOT_HEIGHT / 2 + 3}
          fill="none"
          stroke={colors.focus}
          strokeWidth={2}
        />
        <rect x={-width / 2} y={-ROOT_HEIGHT / 2} width={width} height={ROOT_HEIGHT} rx={ROOT_HEIGHT / 2} fill={colors.accent} />
        <text x={-width / 2 + ROOT_PADDING} y={5} fill={colors.accentText} style={{ font: font(node) }}>
          {node.text}
        </text>
      </g>
    );
  }

  // Text always reads left to right; on the left side it ends at the node's anchor.
  const start = side === 1 ? x : x - width;
  const textX = start + (node.checked === undefined ? 0 : CHECKBOX_SPACE);
  const outer = side === 1 ? x + width : x - width;
  return (
    <g {...props}>
      <rect
        className="focus-ring opacity-0"
        data-export-ignore
        x={start - 4}
        y={y - 15}
        width={width + 8}
        height={24}
        rx={5}
        fill="none"
        stroke={colors.focus}
        strokeWidth={2}
      />
      {/* An invisible hit area over the whole label. */}
      <rect x={start - 4} y={y - 15} width={width + 8} height={24} fill="transparent" />
      {node.checked !== undefined && (
        <g transform={`translate(${start},${y - 10})`}>
          <rect width={11} height={11} rx={2.5} fill={node.checked ? color : 'none'} stroke={node.checked ? color : colors.faint} strokeWidth={1.5} />
          {node.checked && <path d="M2.5 5.75l2 2 4-4.5" fill="none" stroke={colors.surface} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />}
        </g>
      )}
      <text x={textX} y={y} fill={node.kind === 'heading' ? colors.text : colors.muted} style={{ font: font(node) }}>
        {node.text}
      </text>
      <path d={`M${start},${y + UNDERLINE} H${start + width}`} stroke={color} strokeWidth={placed.depth === 1 ? 2.5 : 1.75} strokeLinecap="round" />
      {collapsed && (
        <g transform={`translate(${outer + side * 12},${y + UNDERLINE})`}>
          <circle r={9} fill={colors.surface} stroke={color} strokeWidth={1.5} />
          <text textAnchor="middle" y={3.5} fill={colors.muted} style={{ font: `600 10px ${FONT_FAMILY}` }}>
            +{placed.hiddenChildren}
          </text>
        </g>
      )}
    </g>
  );
}

/** The view scaled to `k` (within the limits), keeping the point (px, py) of the SVG where it is. */
function zoomAround(t: Transform, k: number, px: number, py: number): Transform {
  const next = Math.min(4, Math.max(0.15, k));
  return { k: next, x: px - ((px - t.x) * next) / t.k, y: py - ((py - t.y) * next) / t.k };
}

/**
 * Wheel zoom around the pointer, pinch zoom with two fingers (US-25) and drag to pan; clicks after a drag or a
 * pinch are ignored.
 */
function useZoomPan(svgRef: React.RefObject<SVGSVGElement | null>, layout: MindmapLayout | null) {
  const [transform, setTransform] = useState<Transform>({ k: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; moved: boolean; pointer: number } | null>(null);
  const dragged = useRef(false);
  // The fingers on the map, and while two of them pinch, their distance a moment ago.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);

  const fit = () => {
    const svg = svgRef.current;
    if (!svg || !layout) return;
    const { width, height } = svg.getBoundingClientRect();
    const { bounds } = layout;
    const k = Math.min(1.4, (width - 2 * EXPORT_PADDING) / bounds.width, (height - 2 * EXPORT_PADDING) / bounds.height);
    setTransform({ k, x: width / 2 - (bounds.x + bounds.width / 2) * k, y: height / 2 - (bounds.y + bounds.height / 2) * k });
  };

  // Fit when the map first appears; later layout changes (collapsing) keep the view.
  const fittedFor = useRef<MindmapLayout | null>(null);
  useLayoutEffect(() => {
    if (layout && !fittedFor.current) {
      fittedFor.current = layout;
      fit();
    }
  });

  // React's wheel listener is passive, so the page would scroll too.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      setTransform((t) => zoomAround(t, t.k * Math.exp(-event.deltaY * 0.0015), px, py));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [svgRef, layout]);

  const handlers = {
    onPointerDown: (event: ReactPointerEvent<SVGSVGElement>) => {
      if (event.button !== 0) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.current.size === 2) {
        // A second finger: pinch instead of pan.
        const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
        pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
        drag.current = null;
        dragged.current = true;
        return;
      }
      drag.current = { x: event.clientX, y: event.clientY, moved: false, pointer: event.pointerId };
      dragged.current = false;
    },
    onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => {
      if (pointers.current.has(event.pointerId)) pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinch.current !== null && pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        const factor = pinch.current > 0 ? distance / pinch.current : 1;
        pinch.current = distance;
        const rect = event.currentTarget.getBoundingClientRect();
        const px = (a.x + b.x) / 2 - rect.left;
        const py = (a.y + b.y) / 2 - rect.top;
        setTransform((t) => zoomAround(t, t.k * factor, px, py));
        return;
      }
      const current = drag.current;
      if (!current) return;
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;
      if (!current.moved && Math.hypot(dx, dy) < 4) return;
      if (!current.moved) event.currentTarget.setPointerCapture(current.pointer);
      current.moved = true;
      current.x = event.clientX;
      current.y = event.clientY;
      setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
    },
    onPointerUp: (event: ReactPointerEvent<SVGSVGElement>) => {
      pointers.current.delete(event.pointerId);
      if (pinch.current !== null) {
        // The pinch ends with its last finger, and lifting none of them is a click.
        if (pointers.current.size === 0) pinch.current = null;
        return;
      }
      dragged.current = drag.current?.moved ?? false;
      drag.current = null;
    },
    onPointerCancel: (event: ReactPointerEvent<SVGSVGElement>) => {
      pointers.current.delete(event.pointerId);
      if (pointers.current.size === 0) pinch.current = null;
      drag.current = null;
    },
  };

  return { transform, fit, handlers, wasDrag: () => dragged.current };
}

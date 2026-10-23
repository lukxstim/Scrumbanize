import { LABEL_STYLES } from '../../utils/labels';
import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useGraph } from '../../hooks/useGraph';
import { useStoredState } from '../../hooks/useStoredState';
import type { GraphNode } from '../../types/graph';
import { DEFAULT_GRAPH_FILTER, filterGraph, isGraphFilter, nodePath, searchGraph, type GraphFilter } from '../../utils/graph';
import { countLabel } from '../../utils/projects';
import { FitIcon, GraphIcon } from '../icons';
import NotesViewSwitch from '../notes/NotesViewSwitch';
import SearchBar from '../notes/SearchBar';
import Button from '../ui/Button';
import Skeleton from '../ui/Skeleton';
import ForceGraphCanvas from './ForceGraphCanvas';

const FILTERS: { key: keyof GraphFilter; label: string }[] = [
  { key: 'notes', label: 'Notizen' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'done', label: 'Erledigte' },
  { key: 'isolated', label: 'Ohne Verbindung' },
];

/** Notes and tasks of the project as a network at /p/:projectId/graph; a click opens the note or task. */
export default function GraphPage() {
  const projectId = Number(useParams().projectId);
  const navigate = useNavigate();
  const { graph, status, reload } = useGraph(projectId);
  const [filter, setFilter] = useStoredState<GraphFilter>('scrumbanize.graphFilter', DEFAULT_GRAPH_FILTER, isGraphFilter);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [hovered, setHovered] = useState<GraphNode | null>(null);
  const fit = useRef<() => void>(() => {});

  const shown = useMemo(() => (graph ? filterGraph(graph, filter) : { nodes: [], edges: [] }), [graph, filter]);
  const matches = useMemo(() => searchGraph(shown.nodes, deferredQuery), [shown.nodes, deferredQuery]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      {/* One row of controls; it scopes the whole graph below. */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <h1 className="text-sm font-semibold text-fg">Notizen</h1>
        <NotesViewSwitch projectId={projectId} view="graph" />
        <div className="w-56">
          <SearchBar value={query} onChange={setQuery} placeholder="Im Graph suchen" />
        </div>
        <div role="group" aria-label="Anzeigen" className="flex flex-wrap gap-1.5">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter[key]}
              disabled={key === 'done' && !filter.tasks}
              onClick={() => setFilter({ ...filter, [key]: !filter[key] })}
              className={`h-6 rounded-full px-2.5 text-xs font-medium ring-1 ring-inset pointer-coarse:h-11 transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50 ${
                filter[key] ? 'bg-accent-muted text-accent-text ring-accent-line' : 'text-fg-subtle ring-line hover:text-fg'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {graph && (
          <span className="text-xs text-fg-subtle tabular-nums">
            {deferredQuery.trim() ? `${countLabel(matches.size, 'Treffer', 'Treffer')} · ` : ''}
            {countLabel(shown.nodes.length, 'Knoten', 'Knoten')} · {countLabel(shown.edges.length, 'Verbindung', 'Verbindungen')}
          </span>
        )}
        <Button size="sm" variant="ghost" onClick={() => fit.current()} disabled={shown.nodes.length === 0}>
          <FitIcon className="size-3.5" />
          Einpassen
        </Button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {status === 'loading' && <Skeleton className="absolute inset-6 rounded-xl" />}

        {status === 'error' && (
          <div className="grid h-full place-items-center text-center text-sm text-danger-text">
            <div>
              <p>Der Graph konnte nicht geladen werden.</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => void reload()}>
                Erneut versuchen
              </Button>
            </div>
          </div>
        )}

        {status === 'ready' && shown.nodes.length === 0 && (
          <div className="grid h-full place-items-center text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="grid size-12 place-items-center rounded-xl bg-surface-muted text-fg-subtle ring-1 ring-line">
                <GraphIcon className="size-6" />
              </div>
              <p className="text-sm text-fg-subtle">
                {graph?.nodes.length ? 'Kein Knoten passt zu den gewählten Filtern.' : 'Noch keine Notizen oder Tasks in diesem Projekt.'}
              </p>
            </div>
          </div>
        )}

        {status === 'ready' && shown.nodes.length > 0 && (
          <>
            <ForceGraphCanvas
              key={projectId}
              projectId={projectId}
              data={shown}
              matches={matches}
              onOpen={(node) => navigate(nodePath(projectId, node))}
              onHover={setHovered}
              onReady={(fitGraph) => (fit.current = fitGraph)}
            />
            <GraphLegend />
            {hovered && <NodeCard node={hovered} />}
          </>
        )}
      </div>
    </div>
  );
}

function GraphLegend() {
  return (
    <ul
      aria-label="Legende"
      // Phones (US-25) need the little room for the graph itself.
      className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1 rounded-lg max-md:hidden border border-line bg-surface/90 px-3 py-2 text-xs text-fg-muted shadow-card backdrop-blur"
    >
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="size-2.5 rounded-full bg-chart-1" /> Notiz
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="size-2.5 rounded-[3px] bg-chart-2" /> Task
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="size-2.5 rounded-[3px] bg-fg-faint opacity-60" /> Erledigter Task
      </li>
      <li className="flex items-center gap-2">
        <svg aria-hidden="true" width="18" height="8" className="text-line-strong">
          <path d="M1 4h12" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 1l4 3-4 3z" fill="currentColor" />
        </svg>
        blockiert
      </li>
      <li className="flex items-center gap-2">
        <svg aria-hidden="true" width="18" height="8" className="text-line-strong">
          <path d="M1 4h16" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        umgewandelt / hängt zusammen
      </li>
      <li className="flex items-center gap-2">
        <svg aria-hidden="true" width="18" height="8" className="text-line-strong">
          <path d="M1 4h16" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
        </svg>
        im Text verlinkt
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="size-2.5 rounded-full border-2 border-chart-1 opacity-60" /> aus anderem Projekt
      </li>
    </ul>
  );
}

/** Details of the node under the pointer; the click opens it. */
function NodeCard({ node }: { node: GraphNode }) {
  const detail =
    node.type === 'note'
      ? node.tags.length
        ? node.tags.map((t) => `#${t}`).join(' ')
        : 'Notiz'
      : `Task #${node.entityId}${node.columnName ? ` · ${node.columnName}` : ''}${node.done ? ' · erledigt' : ''}`;
  const place = node.external ? `${node.external.projectKind === 'notebook' ? 'Notizbuch' : 'Projekt'} „${node.external.projectName}“` : null;
  return (
    <div className="pointer-events-none absolute right-3 bottom-3 max-w-72 rounded-lg border border-line bg-surface px-3 py-2 shadow-popover">
      <p className="truncate text-sm font-medium text-fg">{node.title || (node.type === 'note' ? 'Unbenannte Notiz' : 'Ohne Titel')}</p>
      <p className="mt-0.5 truncate text-xs text-fg-subtle">{detail}</p>
      {place && <p className="mt-0.5 truncate text-xs text-fg-subtle">aus {place}</p>}
      {node.type === 'task' && node.labels.length > 0 && (
        <p className="mt-1 flex flex-wrap gap-1">
          {node.labels.map((label) => (
            <span key={label.name} className={`inline-flex items-center gap-1 rounded px-1.5 py-px text-[11px] text-fg ring-1 ring-inset ${LABEL_STYLES[label.color].chip}`}>
              <span aria-hidden="true" className={`size-1.5 rounded-full ${LABEL_STYLES[label.color].dot}`} />
              {label.name}
            </span>
          ))}
        </p>
      )}
      <p className="mt-1 text-[11px] text-fg-faint">Klicken zum Öffnen</p>
    </div>
  );
}

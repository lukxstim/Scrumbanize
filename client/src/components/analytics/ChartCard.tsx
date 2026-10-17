import { useState, type ReactNode } from 'react';
import SegmentedControl from '../ui/SegmentedControl';

interface ChartCardProps {
  title: string;
  description?: ReactNode;
  /** Extra controls next to the chart/table switch. */
  actions?: ReactNode;
  chart: ReactNode;
  /** The same values as a table, so nothing is only readable by hovering. */
  table: ReactNode;
  /** Shown instead of chart and table when there is nothing to show. */
  empty?: ReactNode;
}

/** A card with one chart and its table view. */
export default function ChartCard({ title, description, actions, chart, table, empty }: ChartCardProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <section aria-label={title} className="rounded-xl border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-fg-subtle">{description}</p>}
        </div>
        {!empty && (
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            <SegmentedControl
              label={`${title}: Darstellung`}
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: 'chart', label: 'Diagramm' },
                { value: 'table', label: 'Tabelle' },
              ]}
            />
          </div>
        )}
      </div>
      <div className="mt-4">
        {empty ?? (view === 'chart' ? chart : <div className="max-h-80 overflow-auto">{table}</div>)}
      </div>
    </section>
  );
}

export function EmptyChart({ children }: { children: ReactNode }) {
  return <p className="grid h-40 place-items-center rounded-lg bg-surface-muted px-4 text-center text-sm text-fg-subtle">{children}</p>;
}

/** The tooltip box: the value leads, the series name follows, keyed by a short line of the series color. */
export function TooltipBox({ title, rows }: { title: string; rows: { color?: string; label: string; value: string }[] }) {
  return (
    <div className="min-w-40 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-popover">
      <p className="mb-1 font-medium text-fg-muted">{title}</p>
      {rows.map((row) => (
        <p key={row.label} className="flex items-center gap-2 py-0.5">
          {row.color && <span aria-hidden="true" className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />}
          <span className="font-semibold text-fg tabular-nums">{row.value}</span>
          <span className="text-fg-subtle">{row.label}</span>
        </p>
      ))}
    </div>
  );
}

/** Legend entries: a swatch shaped like the mark (`bar` or `line`) beside text in text color. */
export function Legend({ items }: { items: { color: string; label: string; shape: 'bar' | 'line' | 'area' }[] }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={item.shape === 'line' ? 'h-0.5 w-3 rounded-full' : 'size-2.5 rounded-sm'}
            style={{ backgroundColor: item.color, opacity: item.shape === 'area' ? 0.25 : 1 }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export const tableClass = 'w-full text-left text-sm [&_td]:py-1.5 [&_td]:pr-4 [&_th]:pb-2 [&_th]:pr-4 [&_th]:text-xs [&_th]:font-medium [&_th]:text-fg-subtle [&_tbody_tr]:border-t [&_tbody_tr]:border-line';

/** Axis and grid styling shared by the charts: hairline, recessive, in text tokens. */
export const axisProps = {
  stroke: 'var(--color-line-strong)',
  tick: { fill: 'var(--color-fg-subtle)', fontSize: 11 },
  tickLine: false,
} as const;

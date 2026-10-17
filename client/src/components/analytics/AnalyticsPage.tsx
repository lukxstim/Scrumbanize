import { useMemo, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useAnalytics } from '../../hooks/useAnalytics';
import type { AnalyticsReport, Granularity } from '../../types/analytics';
import {
  defaultGranularity,
  formatDay,
  formatDuration,
  presetRange,
  RANGE_PRESETS,
  readFilter,
  toDateString,
  writeFilter,
  type AnalyticsFilter,
  type RangePreset,
} from '../../utils/analytics';
import { ChartIcon, InfoIcon } from '../icons';
import Button from '../ui/Button';
import SegmentedControl from '../ui/SegmentedControl';
import Skeleton from '../ui/Skeleton';
import FlowTimeChart from './FlowTimeChart';
import VelocityChart from './VelocityChart';
import WipChart from './WipChart';

const dateInputClass =
  'h-7 rounded-md border border-line bg-surface px-2 text-xs text-fg tabular-nums focus-visible:outline-2 focus-visible:outline-accent';

/** Statistics of the project at /p/:projectId/analytics: velocity, lead and cycle times, WIP limit breaches. */
export default function AnalyticsPage() {
  const projectId = Number(useParams().projectId);
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = useMemo(() => readFilter(searchParams, new Date()), [searchParams]);
  const { report, status, refreshing, reload } = useAnalytics(projectId, filter);

  function update(next: AnalyticsFilter) {
    // Keeps other parameters, e.g. the open activity drawer.
    const params = new URLSearchParams(searchParams);
    for (const key of ['range', 'from', 'to', 'g']) params.delete(key);
    for (const [key, value] of writeFilter(next)) params.set(key, value);
    setSearchParams(params, { replace: true });
  }

  function choosePreset(preset: RangePreset) {
    if (preset === 'custom') update({ ...filter, preset });
    else update({ preset, ...presetRange(preset, new Date()), granularity: defaultGranularity(preset) });
  }

  function chooseDate(key: 'from' | 'to', value: string) {
    if (!value) return;
    const next = { ...filter, preset: 'custom' as const, [key]: value };
    // Keeps the range valid: moving one end past the other moves both.
    if (next.from > next.to) next[key === 'from' ? 'to' : 'from'] = value;
    update(next);
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">Statistiken</h1>
          <p className="mt-1 text-sm text-fg-subtle">
            Durchsatz, Durchlaufzeiten und WIP-Limits dieses Projekts, berechnet aus Board und Aktivitätsprotokoll.
          </p>
        </div>

        {/* One filter row; it scopes every figure below. */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <SegmentedControl label="Zeitraum" size="sm" value={filter.preset} onChange={choosePreset} options={RANGE_PRESETS} />
          {filter.preset === 'custom' && (
            <div className="flex items-center gap-1.5 text-xs text-fg-subtle">
              <input
                type="date"
                aria-label="Von"
                className={dateInputClass}
                value={filter.from}
                max={toDateString(new Date())}
                onChange={(e) => chooseDate('from', e.target.value)}
              />
              <span aria-hidden="true">–</span>
              <input type="date" aria-label="Bis" className={dateInputClass} value={filter.to} onChange={(e) => chooseDate('to', e.target.value)} />
            </div>
          )}
          <SegmentedControl<Granularity>
            label="Einteilung"
            size="sm"
            value={filter.granularity}
            onChange={(granularity) => update({ ...filter, granularity })}
            options={[
              { value: 'week', label: 'Wochen' },
              { value: 'month', label: 'Monate' },
            ]}
          />
          {report && (
            <span className="text-xs text-fg-subtle tabular-nums">
              {formatDay(`${report.range.from}T00:00`)} – {formatDay(`${report.range.to}T00:00`)}
            </span>
          )}
        </div>

        {status === 'loading' && (
          <div className="mt-6 space-y-4" aria-label="Lade Statistiken …">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-80 rounded-xl" />
          </div>
        )}

        {status === 'error' && (
          <div className="py-16 text-center text-sm text-danger-text">
            <p>Die Statistiken konnten nicht geladen werden.</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => void reload()}>
              Erneut versuchen
            </Button>
          </div>
        )}

        {status === 'ready' && report && (
          // Reloading keeps the previous figures, dimmed, instead of flashing a skeleton.
          <div className={`mt-6 space-y-5 transition-opacity duration-150 ${refreshing ? 'opacity-60' : ''}`} aria-busy={refreshing}>
            <CoverageNotice report={report} />
            <Kpis report={report} />
            <VelocityChart buckets={report.velocity} granularity={report.range.granularity} doneColumn={report.doneColumn?.name ?? null} />
            <FlowTimeChart
              projectId={projectId}
              completions={report.completions}
              leadTime={report.leadTime}
              cycleTime={report.cycleTime}
              domain={[Date.parse(`${report.range.from}T00:00`), Date.parse(`${report.range.to}T23:59:59`)]}
            />
            <WipChart columns={report.wip} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Says from when on there are figures; nothing before the activity log began is estimated. */
function CoverageNotice({ report }: { report: AnalyticsReport }) {
  const { coverageStart, range } = report;
  if (coverageStart !== null && Date.parse(coverageStart) <= Date.parse(`${range.from}T00:00`)) return null;
  return (
    <p className="flex items-start gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2 text-sm text-fg-muted">
      <InfoIcon className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
      {coverageStart === null
        ? 'Für dieses Projekt gibt es noch keine Einträge im Aktivitätsprotokoll, deshalb noch keine Daten. Sobald Tasks angelegt und verschoben werden, erscheinen hier Statistiken.'
        : `Das Aktivitätsprotokoll dieses Projekts beginnt am ${formatDay(coverageStart)}. Für die Zeit davor gibt es keine Daten; es wird nichts geschätzt.`}
    </p>
  );
}

function Kpis({ report }: { report: AnalyticsReport }) {
  const breaches = report.wip.reduce((sum, c) => sum + c.episodes, 0);
  const overLimitMs = report.wip.reduce((sum, c) => sum + c.overLimitMs, 0);
  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile label="Erledigt" value={String(report.totals.completed)} detail={`${report.totals.created} neu angelegt`} />
      <Tile
        label="Lead Time (Median)"
        value={formatDuration(report.leadTime.medianMs)}
        detail={report.leadTime.count > 1 ? `85 % in ≤ ${formatDuration(report.leadTime.p85Ms)}` : 'Anlegen bis erledigt'}
        primary
      />
      <Tile
        label="Cycle Time (Median)"
        value={formatDuration(report.cycleTime.medianMs)}
        detail={report.cycleTime.count > 1 ? `85 % in ≤ ${formatDuration(report.cycleTime.p85Ms)}` : 'Arbeitsbeginn bis erledigt'}
      />
      <Tile
        label="WIP-Überschreitungen"
        value={String(breaches)}
        detail={overLimitMs > 0 ? `${formatDuration(overLimitMs)} über dem Limit` : 'kein Limit überschritten'}
      />
    </dl>
  );
}

function Tile({ label, value, detail, primary = false }: { label: string; value: string; detail: ReactNode; primary?: boolean }) {
  return (
    <div className={`rounded-xl border bg-surface px-4 py-3 shadow-card ${primary ? 'border-accent-line' : 'border-line'}`}>
      <dt className="flex items-center gap-1.5 text-xs font-medium text-fg-subtle">
        {primary && <ChartIcon className="size-3.5 text-accent-text" />}
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight text-fg">{value}</dd>
      <dd className="mt-0.5 truncate text-xs text-fg-subtle">{detail}</dd>
    </div>
  );
}

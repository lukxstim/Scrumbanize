import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import type { Completion, DurationStats } from '../../types/analytics';
import { formatDay, formatDuration, formatShortDay, toDays } from '../../utils/analytics';
import { paths } from '../../utils/paths';
import SegmentedControl from '../ui/SegmentedControl';
import ChartCard, { axisProps, EmptyChart, tableClass, TooltipBox } from './ChartCard';

type Measure = 'lead' | 'cycle';

const MEASURES: Record<Measure, { label: string; description: string; key: 'leadTimeMs' | 'cycleTimeMs' }> = {
  lead: {
    label: 'Lead Time',
    description: 'Vom Anlegen eines Tasks bis „Erledigt“.',
    key: 'leadTimeMs',
  },
  cycle: {
    label: 'Cycle Time',
    description: 'Vom Verlassen der ersten Spalte (oder vom Anlegen weiter rechts) bis „Erledigt“.',
    key: 'cycleTimeMs',
  },
};

const DOT = 'var(--color-chart-1)';

interface FlowTimeChartProps {
  projectId: number;
  completions: Completion[];
  leadTime: DurationStats;
  cycleTime: DurationStats;
  /** Start and end of the range (epoch ms), so the x axis spans it even with few points. */
  domain: [number, number];
}

/** Every completion as a dot (when it was finished × how long it took), with median and 85th percentile. */
export default function FlowTimeChart({ projectId, completions, leadTime, cycleTime, domain }: FlowTimeChartProps) {
  const navigate = useNavigate();
  const [measure, setMeasure] = useState<Measure>('lead');
  const { label, description, key } = MEASURES[measure];
  const stats = measure === 'lead' ? leadTime : cycleTime;
  const points = completions.flatMap((c) => {
    const ms = c[key];
    return ms === null ? [] : [{ ...c, x: Date.parse(c.completedAt), y: toDays(ms), ms }];
  });
  const left = completions.length - points.length;

  return (
    <ChartCard
      title="Durchlaufzeiten"
      description={
        <>
          {description}
          {left > 0 && ` ${left} ${left === 1 ? 'Abschluss' : 'Abschlüsse'} ohne bekannten Start nicht enthalten.`}
        </>
      }
      actions={
        <SegmentedControl
          label="Kennzahl"
          size="sm"
          value={measure}
          onChange={setMeasure}
          options={[
            { value: 'lead', label: 'Lead Time' },
            { value: 'cycle', label: 'Cycle Time' },
          ]}
        />
      }
      empty={completions.length === 0 ? <EmptyChart>In diesem Zeitraum wurde kein Task erledigt.</EmptyChart> : undefined}
      chart={
        points.length === 0 ? (
          <EmptyChart>Für keinen erledigten Task ist die {label} bekannt.</EmptyChart>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--color-line)" vertical={false} />
              <XAxis
                type="number"
                dataKey="x"
                domain={domain}
                scale="time"
                tickFormatter={(value: number) => formatShortDay(value)}
                {...axisProps}
                minTickGap={24}
              />
              <YAxis
                type="number"
                dataKey="y"
                {...axisProps}
                axisLine={false}
                width={48}
                tickFormatter={(value: number) => `${Math.round(value * 10) / 10} T`}
              />
              {stats.medianMs !== null && (
                <ReferenceLine
                  y={toDays(stats.medianMs)}
                  stroke="var(--color-fg-muted)"
                  label={{ value: `Median ${formatDuration(stats.medianMs)}`, position: 'insideTopRight', fill: 'var(--color-fg-muted)', fontSize: 11 }}
                />
              )}
              {stats.p85Ms !== null && stats.count > 1 && (
                <ReferenceLine
                  y={toDays(stats.p85Ms)}
                  stroke="var(--color-fg-faint)"
                  label={{ value: `85 % ≤ ${formatDuration(stats.p85Ms)}`, position: 'insideTopRight', fill: 'var(--color-fg-subtle)', fontSize: 11 }}
                />
              )}
              <Tooltip
                cursor={false}
                content={({ active, payload }) => {
                  const point = payload?.[0]?.payload as (typeof points)[number] | undefined;
                  if (!active || !point) return null;
                  return (
                    <TooltipBox
                      title={point.title}
                      rows={[
                        { color: DOT, label, value: formatDuration(point.ms) },
                        { label: point.live ? 'erledigt' : 'erledigt, inzwischen gelöscht', value: formatDay(point.x) },
                      ]}
                    />
                  );
                }}
              />
              <Scatter
                data={points}
                isAnimationActive={false}
                onClick={(item) => {
                  const point = item.payload as (typeof points)[number] | undefined;
                  if (point?.live) navigate(paths.task(projectId, point.taskId));
                }}
                shape={(props: { cx?: number; cy?: number; payload?: { live: boolean } }) => (
                  <g className={props.payload?.live ? 'cursor-pointer' : undefined}>
                    {/* A hit area well beyond the dot, so it is easy to point at. */}
                    <circle cx={props.cx} cy={props.cy} r={12} fill="transparent" />
                    <circle cx={props.cx} cy={props.cy} r={4.5} fill={DOT} stroke="var(--color-surface)" strokeWidth={2} />
                  </g>
                )}
              />
            </ScatterChart>
          </ResponsiveContainer>
        )
      }
      table={
        <table className={tableClass}>
          <thead>
            <tr>
              <th scope="col">Task</th>
              <th scope="col">Erledigt am</th>
              <th scope="col" className="text-right">Lead Time</th>
              <th scope="col" className="text-right">Cycle Time</th>
            </tr>
          </thead>
          <tbody>
            {[...completions].reverse().map((c, i) => (
              <tr key={`${c.taskId}-${c.completedAt}-${i}`}>
                <td className="max-w-64 truncate">
                  {c.live ? (
                    <Link to={paths.task(projectId, c.taskId)} className="text-accent-text hover:underline">
                      {c.title}
                    </Link>
                  ) : (
                    <span title="Inzwischen gelöscht">
                      {c.title} <span className="text-fg-subtle">(gelöscht)</span>
                    </span>
                  )}
                </td>
                <td className="tabular-nums">{formatDay(c.completedAt)}</td>
                <td className="text-right tabular-nums">{formatDuration(c.leadTimeMs)}</td>
                <td className="text-right tabular-nums">{formatDuration(c.cycleTimeMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}

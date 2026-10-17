import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { WipColumn } from '../../types/analytics';
import { breachIntervals, formatDay, formatDuration, formatShortDay } from '../../utils/analytics';
import ChartCard, { axisProps, EmptyChart, Legend, tableClass, TooltipBox } from './ChartCard';

const EPISODES = 'var(--color-chart-1)';
const COUNT = 'var(--color-chart-1)';
const LIMIT = 'var(--color-fg-muted)';
const BREACH = 'var(--color-chart-breach)';

const columnLabel = (column: WipColumn) => (column.exists ? column.name : `${column.name} (gelöscht)`);

/** How often and how long each column was over its WIP limit, and one column's count against its limit over time. */
export default function WipChart({ columns }: { columns: WipColumn[] }) {
  const worst = columns.reduce<WipColumn | undefined>((best, c) => (!best || c.overLimitMs > best.overLimitMs ? c : best), undefined);
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined);
  const selected = columns.find((c) => c.id === selectedId) ?? worst;
  const bars = columns.map((c) => ({ ...c, label: columnLabel(c) }));

  return (
    <ChartCard
      title="WIP-Limit-Überschreitungen"
      description="Wie oft und wie lange Spalten über ihrem WIP-Limit lagen, auch nach dem Senken eines Limits."
      empty={columns.length === 0 ? <EmptyChart>Im Zeitraum hatte keine Spalte ein WIP-Limit.</EmptyChart> : undefined}
      chart={
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div>
            <p className="mb-2 text-xs text-fg-subtle">Überschreitungen je Spalte · zum Verlauf anklicken</p>
            <ResponsiveContainer width="100%" height={Math.max(120, bars.length * 40 + 24)}>
              <BarChart data={bars} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 0 }}>
                <CartesianGrid horizontal={false} stroke="var(--color-line)" />
                <XAxis type="number" allowDecimals={false} {...axisProps} />
                <YAxis type="category" dataKey="label" width={110} {...axisProps} axisLine={false} />
                <Tooltip
                  cursor={{ fill: 'var(--color-surface-hover)' }}
                  content={({ active, payload }) => {
                    const column = payload?.[0]?.payload as (typeof bars)[number] | undefined;
                    if (!active || !column) return null;
                    return (
                      <TooltipBox
                        title={column.label}
                        rows={[
                          { color: EPISODES, label: column.episodes === 1 ? 'Überschreitung' : 'Überschreitungen', value: String(column.episodes) },
                          { label: 'über dem Limit', value: column.overLimitMs > 0 ? formatDuration(column.overLimitMs) : '–' },
                          { label: 'Tasks zu viel (max.)', value: String(column.peakOver) },
                        ]}
                      />
                    );
                  }}
                />
                <Bar
                  dataKey="episodes"
                  fill={EPISODES}
                  radius={[0, 4, 4, 0]}
                  maxBarSize={20}
                  isAnimationActive={false}
                  className="cursor-pointer"
                  onClick={(item) => setSelectedId((item.payload as WipColumn | undefined)?.id)}
                  label={{ position: 'right', fill: 'var(--color-fg-muted)', fontSize: 11 }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {selected && <WipTimeline column={selected} />}
        </div>
      }
      table={
        <table className={tableClass}>
          <thead>
            <tr>
              <th scope="col">Spalte</th>
              <th scope="col" className="text-right">Limit heute</th>
              <th scope="col" className="text-right">Überschreitungen</th>
              <th scope="col" className="text-right">Zeit über Limit</th>
              <th scope="col" className="text-right">Max. zu viel</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((c) => (
              <tr key={c.id}>
                <td>{columnLabel(c)}</td>
                <td className="text-right tabular-nums">{c.wipLimit ?? '–'}</td>
                <td className="text-right tabular-nums">{c.episodes}</td>
                <td className="text-right tabular-nums">{c.overLimitMs > 0 ? formatDuration(c.overLimitMs) : '–'}</td>
                <td className="text-right tabular-nums">{c.peakOver}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}

function WipTimeline({ column }: { column: WipColumn }) {
  const data = column.series.map((point) => ({ x: Date.parse(point.at), count: point.count, limit: point.limit }));
  const breaches = breachIntervals(column.series);
  const domain: [number, number] = [data[0]?.x ?? 0, data.at(-1)?.x ?? 0];

  return (
    <div>
      <p className="mb-2 text-xs text-fg-subtle">
        Verlauf: <span className="font-medium text-fg-muted">{columnLabel(column)}</span>
      </p>
      <Legend
        items={[
          { color: COUNT, label: 'Tasks in der Spalte', shape: 'line' },
          { color: LIMIT, label: 'WIP-Limit', shape: 'line' },
          ...(breaches.length > 0 ? [{ color: BREACH, label: 'Über dem Limit', shape: 'area' as const }] : []),
        ]}
      />
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke="var(--color-line)" />
          {breaches.map(([x1, x2]) => (
            <ReferenceArea key={x1} x1={x1} x2={x2} fill={BREACH} fillOpacity={0.12} ifOverflow="hidden" />
          ))}
          <XAxis type="number" dataKey="x" scale="time" domain={domain} tickFormatter={(v: number) => formatShortDay(v)} {...axisProps} minTickGap={24} />
          <YAxis allowDecimals={false} {...axisProps} axisLine={false} width={40} />
          <Tooltip
            cursor={{ stroke: 'var(--color-line-strong)' }}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !point) return null;
              const over = point.limit !== null && point.count > point.limit;
              return (
                <TooltipBox
                  title={`ab ${formatDay(point.x)}${over ? ' · über dem Limit' : ''}`}
                  rows={[
                    { color: COUNT, label: 'Tasks', value: String(point.count) },
                    { color: LIMIT, label: 'WIP-Limit', value: point.limit === null ? 'keins' : String(point.limit) },
                  ]}
                />
              );
            }}
          />
          <Line type="stepAfter" dataKey="limit" stroke={LIMIT} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
          <Line type="stepAfter" dataKey="count" stroke={COUNT} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

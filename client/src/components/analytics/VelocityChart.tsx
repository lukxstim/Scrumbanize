import { Bar, BarChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Granularity, VelocityBucket } from '../../types/analytics';
import { bucketLabel, bucketRangeLabel } from '../../utils/analytics';
import ChartCard, { axisProps, EmptyChart, Legend, tableClass, TooltipBox } from './ChartCard';

const COMPLETED = 'var(--color-chart-1)';
const CREATED = 'var(--color-chart-2)';

interface VelocityChartProps {
  buckets: VelocityBucket[];
  granularity: Granularity;
  doneColumn: string | null;
}

/** Tasks finished per week or month, beside the tasks created (throughput against intake). */
export default function VelocityChart({ buckets, granularity, doneColumn }: VelocityChartProps) {
  const data = buckets.map((bucket) => ({ ...bucket, label: bucketLabel(bucket.start, granularity) }));
  const uncovered = data.filter((bucket) => bucket.completed === null);
  const period = granularity === 'week' ? 'Woche' : 'Monat';

  return (
    <ChartCard
      title="Velocity"
      description={
        doneColumn
          ? `Erledigte Tasks pro ${period}: jedes Mal, wenn ein Task in „${doneColumn}“ ankommt, auch erneut.`
          : 'Das Board hat keine Spalten.'
      }
      empty={uncovered.length === data.length ? <EmptyChart>Für diesen Zeitraum gibt es keine Daten.</EmptyChart> : undefined}
      chart={
        <>
          <Legend
            items={[
              { color: COMPLETED, label: 'Erledigt', shape: 'bar' },
              { color: CREATED, label: 'Neu angelegt', shape: 'bar' },
            ]}
          />
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} barGap={2} barCategoryGap="25%" margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid vertical={false} stroke="var(--color-line)" />
              {uncovered.length > 0 && (
                <ReferenceArea
                  x1={uncovered[0]!.label}
                  x2={uncovered.at(-1)!.label}
                  fill="var(--color-surface-muted)"
                  fillOpacity={1}
                  label={{ value: 'Keine Daten', fill: 'var(--color-fg-subtle)', fontSize: 11, position: 'insideTop' }}
                />
              )}
              <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={8} />
              <YAxis {...axisProps} axisLine={false} allowDecimals={false} width={40} />
              <Tooltip
                cursor={{ fill: 'var(--color-surface-hover)' }}
                content={({ active, payload }) => {
                  const bucket = payload?.[0]?.payload as (typeof data)[number] | undefined;
                  if (!active || !bucket) return null;
                  return (
                    <TooltipBox
                      title={bucketRangeLabel(bucket.start, granularity)}
                      rows={
                        bucket.completed === null
                          ? [{ label: 'vor Beginn des Aktivitätsprotokolls', value: 'Keine Daten' }]
                          : [
                              { color: COMPLETED, label: 'erledigt', value: String(bucket.completed) },
                              { color: CREATED, label: 'neu angelegt', value: String(bucket.created) },
                            ]
                      }
                    />
                  );
                }}
              />
              <Bar dataKey="completed" name="Erledigt" fill={COMPLETED} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
              <Bar dataKey="created" name="Neu angelegt" fill={CREATED} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </>
      }
      table={
        <table className={tableClass}>
          <thead>
            <tr>
              <th scope="col">{period}</th>
              <th scope="col" className="text-right">Erledigt</th>
              <th scope="col" className="text-right">Neu angelegt</th>
            </tr>
          </thead>
          <tbody>
            {data.map((bucket) => (
              <tr key={bucket.start}>
                <td>
                  {bucket.label} <span className="text-fg-subtle">· {bucketRangeLabel(bucket.start, granularity)}</span>
                </td>
                <td className="text-right tabular-nums">{bucket.completed ?? 'Keine Daten'}</td>
                <td className="text-right tabular-nums">{bucket.created ?? 'Keine Daten'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}

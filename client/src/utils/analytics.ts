import type { AnalyticsQuery, Granularity, WipPoint } from '../types/analytics';

export type RangePreset = '4w' | '3m' | '6m' | '12m' | 'custom';

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: '4w', label: '4 Wochen' },
  { value: '3m', label: '3 Monate' },
  { value: '6m', label: '6 Monate' },
  { value: '12m', label: '12 Monate' },
  { value: 'custom', label: 'Zeitraum' },
];

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const pad = (n: number) => String(n).padStart(2, '0');
/** The local calendar day as YYYY-MM-DD. */
export const toDateString = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const fromDateString = (value: string) => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
};
const isDateString = (value: string | null): value is string =>
  value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value) && toDateString(fromDateString(value)) === value;

/** The days a preset covers, ending today. */
export function presetRange(preset: Exclude<RangePreset, 'custom'>, today: Date): { from: string; to: string } {
  const from = new Date(today);
  if (preset === '4w') from.setDate(from.getDate() - 27);
  else {
    from.setMonth(from.getMonth() - { '3m': 3, '6m': 6, '12m': 12 }[preset]);
    from.setDate(from.getDate() + 1);
  }
  return { from: toDateString(from), to: toDateString(today) };
}

/** Coarser buckets for longer ranges, unless chosen otherwise. */
export const defaultGranularity = (preset: RangePreset): Granularity => (preset === '6m' || preset === '12m' ? 'month' : 'week');

export interface AnalyticsFilter extends AnalyticsQuery {
  preset: RangePreset;
}

/** The filter in the URL: `?range=3m&g=week`, or `?from=…&to=…` for a custom range; broken values fall back to 3 months. */
export function readFilter(params: URLSearchParams, today: Date): AnalyticsFilter {
  const from = params.get('from');
  const to = params.get('to');
  const g = params.get('g');
  const range = params.get('range');
  if (isDateString(from) && isDateString(to) && from <= to) {
    return { preset: 'custom', from, to, granularity: g === 'month' || g === 'week' ? g : 'week' };
  }
  const preset = RANGE_PRESETS.some((p) => p.value === range && range !== 'custom') ? (range as Exclude<RangePreset, 'custom'>) : '3m';
  return { preset, ...presetRange(preset, today), granularity: g === 'month' || g === 'week' ? g : defaultGranularity(preset) };
}

export function writeFilter(filter: AnalyticsFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.preset === 'custom') {
    params.set('from', filter.from);
    params.set('to', filter.to);
  } else {
    params.set('range', filter.preset);
  }
  if (filter.granularity !== defaultGranularity(filter.preset)) params.set('g', filter.granularity);
  return params;
}

/** ISO 8601 week number (weeks start on Monday; week 1 holds the year's first Thursday). */
export function isoWeek(date: string): number {
  const day = fromDateString(date);
  const thursday = new Date(day);
  thursday.setDate(day.getDate() + 3 - ((day.getDay() + 6) % 7));
  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * DAY));
}

const monthLabel = new Intl.DateTimeFormat('de-DE', { month: 'short', year: '2-digit' });
const dayLabel = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' });
const fullDayLabel = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Axis label of a bucket: "KW 42" or "Okt. 26". */
export function bucketLabel(start: string, granularity: Granularity): string {
  return granularity === 'week' ? `KW ${isoWeek(start)}` : monthLabel.format(fromDateString(start));
}

/** The days of a bucket, e.g. "12.10. – 18.10.2026" or "Oktober 2026". */
export function bucketRangeLabel(start: string, granularity: Granularity): string {
  const first = fromDateString(start);
  if (granularity === 'month') return first.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  const last = new Date(first);
  last.setDate(first.getDate() + 6);
  return `${dayLabel.format(first)} – ${fullDayLabel.format(last)}`;
}

export const formatDay = (iso: string | number) => fullDayLabel.format(new Date(iso));
export const formatShortDay = (iso: string | number) => dayLabel.format(new Date(iso));

const oneDecimal = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

/** "< 1 Std.", "5 Std.", "1,5 Tage", "12 Tage". */
export function formatDuration(ms: number | null): string {
  if (ms === null) return '–';
  if (ms < HOUR) return '< 1 Std.';
  if (ms < 2 * DAY) return `${Math.round(ms / HOUR)} Std.`;
  const days = ms / DAY;
  return `${days < 10 ? oneDecimal.format(days) : Math.round(days)} Tage`;
}

export const toDays = (ms: number) => ms / DAY;

/** The stretches a WIP series spends over its limit, as [start, end] times. */
export function breachIntervals(series: WipPoint[]): [number, number][] {
  const intervals: [number, number][] = [];
  series.slice(0, -1).forEach((point, i) => {
    if (point.limit === null || point.count <= point.limit) return;
    const start = Date.parse(point.at);
    const end = Date.parse(series[i + 1]!.at);
    const last = intervals.at(-1);
    if (last && last[1] === start) last[1] = end;
    else intervals.push([start, end]);
  });
  return intervals;
}

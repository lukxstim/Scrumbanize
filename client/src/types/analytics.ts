/** Mirrors AnalyticsReport in server/src/analytics.ts. Durations are milliseconds, times ISO strings. */

export type Granularity = 'week' | 'month';

export interface DurationStats {
  count: number;
  medianMs: number | null;
  p85Ms: number | null;
  meanMs: number | null;
}

export interface Completion {
  taskId: number;
  title: string;
  completedAt: string;
  /** Null if the task was created right in Done or its creation is unknown. */
  leadTimeMs: number | null;
  cycleTimeMs: number | null;
  /** On the board today; trashed and purged tasks still count, but cannot be opened. */
  live: boolean;
}

export interface VelocityBucket {
  /** First day of the week or month (YYYY-MM-DD). */
  start: string;
  /** Null before the activity log began ("keine Daten"). */
  completed: number | null;
  created: number | null;
}

export interface WipPoint {
  at: string;
  count: number;
  limit: number | null;
}

export interface WipColumn {
  id: number;
  name: string;
  exists: boolean;
  wipLimit: number | null;
  episodes: number;
  overLimitMs: number;
  peakOver: number;
  /** Step function: each point holds until the next; the last one marks the end of the range. */
  series: WipPoint[];
}

export interface AnalyticsReport {
  range: { from: string; to: string; granularity: Granularity; timeZone: string };
  doneColumn: { id: number; name: string } | null;
  coverageStart: string | null;
  totals: { completed: number; created: number };
  velocity: VelocityBucket[];
  leadTime: DurationStats;
  cycleTime: DurationStats;
  completions: Completion[];
  wip: WipColumn[];
}

export interface AnalyticsQuery {
  from: string;
  to: string;
  granularity: Granularity;
}

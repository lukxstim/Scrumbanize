/**
 * Productivity figures of a project (US-14), computed from the board and the activity log. Pure functions; the SQL
 * lives in analyticsRepository. "Done" is the project's last column, as for task links. Nothing is estimated: before
 * the project's first activity ("coverage start") there is no data.
 */

export type Granularity = 'week' | 'month';

export interface AnalyticsRange {
  /** First and last calendar day (YYYY-MM-DD), widened to whole weeks (Monday to Sunday) or months. */
  from: string;
  to: string;
  granularity: Granularity;
  timeZone: string;
}

/** A change of a task's column or a column's WIP limit, from the activity log. Times are epoch milliseconds. */
export type BoardEvent =
  | { type: 'task-create'; at: number; taskId: number; title: string; columnId: number | null }
  | { type: 'task-move'; at: number; taskId: number; title: string; fromColumnId: number; toColumnId: number }
  /** Entries written before US-14 only name the column, so `columnId` may be missing. */
  | { type: 'task-trash' | 'task-restore'; at: number; taskId: number; columnId: number | null; columnName: string }
  | { type: 'wip-limit'; at: number; columnId: number; from: number | null; to: number | null }
  | { type: 'column-delete'; at: number; columnId: number; name: string; movedTasks: number; targetId: number | null };

export interface AnalyticsInput {
  /** The project's columns today, in board order. */
  columns: { id: number; name: string; wipLimit: number | null }[];
  /** Tasks outside the trash per column, today. */
  taskCounts: Map<number, number>;
  /** All tasks of the project, trashed ones included; purged tasks are gone and only known from the log. */
  tasks: Map<number, { title: string; createdAt: number; live: boolean }>;
  /** The project's task and column entries in log order. */
  events: BoardEvent[];
  /** Time of the project's first activity; null if the log has none. */
  coverageStart: number | null;
  now: number;
}

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
  /** From creating the task; null if it was created right in Done or its creation is unknown. */
  leadTimeMs: number | null;
  /** From leaving the first column (or creation, if created further right); null if unknown. */
  cycleTimeMs: number | null;
  /** The task is on the board (or in Done) today, not in the trash or purged. */
  live: boolean;
}

export interface VelocityBucket {
  /** First day of the week or month. */
  start: string;
  /** Null for periods before the coverage start ("keine Daten"). */
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
  /** False for a column deleted since. */
  exists: boolean;
  /** The limit today. */
  wipLimit: number | null;
  /** Times the column went over its limit (an ongoing breach at the start of the range counts, too). */
  episodes: number;
  overLimitMs: number;
  /** Most tasks above the limit at once. */
  peakOver: number;
  /** Task count and limit as a step function: each point holds until the next one; the last marks the end. */
  series: WipPoint[];
}

export interface AnalyticsReport {
  range: AnalyticsRange;
  doneColumn: { id: number; name: string } | null;
  coverageStart: string | null;
  totals: { completed: number; created: number };
  velocity: VelocityBucket[];
  leadTime: DurationStats;
  cycleTime: DurationStats;
  /** Completions in the range, oldest first. A task that reaches Done again counts again. */
  completions: Completion[];
  /** Columns that had a WIP limit at some point in the range. */
  wip: WipColumn[];
}

export const DEFAULT_WEEKS = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

// ---- calendar days in a time zone ----

const formatters = new Map<string, Intl.DateTimeFormat>();

function wallClock(ms: number, timeZone: string) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(ms).map((part) => [part.type, Number(part.value)]));
  return Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
}

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const isoDate = (utcMs: number) => new Date(utcMs).toISOString().slice(0, 10);
const utcOf = (date: string) => Date.parse(`${date}T00:00:00Z`);
export const addDays = (date: string, days: number) => isoDate(utcOf(date) + days * DAY_MS);

/** The calendar day (YYYY-MM-DD) of an instant in the time zone. */
export const localDate = (ms: number, timeZone: string) => isoDate(wallClock(ms, timeZone));

/** The instant a calendar day begins in the time zone; the offset is taken at that instant, so DST days work. */
export function startOfDay(date: string, timeZone: string): number {
  const wall = utcOf(date);
  const offsetAt = (ms: number) => wallClock(ms, timeZone) - Math.floor(ms / 1000) * 1000;
  return wall - offsetAt(wall - offsetAt(wall));
}

/** The Monday of the day's ISO week, or the first of its month. */
export function bucketStart(date: string, granularity: Granularity): string {
  if (granularity === 'month') return `${date.slice(0, 7)}-01`;
  const weekday = (new Date(utcOf(date)).getUTCDay() + 6) % 7;
  return addDays(date, -weekday);
}

export function nextBucket(start: string, granularity: Granularity): string {
  if (granularity === 'week') return addDays(start, 7);
  const date = new Date(utcOf(start));
  date.setUTCMonth(date.getUTCMonth() + 1);
  return isoDate(date.getTime());
}

/** The requested days (by default this week and the DEFAULT_WEEKS - 1 before), widened to whole buckets. */
export function resolveRange(
  query: { from?: string; to?: string; granularity: Granularity; timeZone: string },
  now: number,
): AnalyticsRange {
  const { granularity, timeZone } = query;
  const to = query.to ?? localDate(now, timeZone);
  const from = query.from ?? addDays(bucketStart(to, 'week'), -(DEFAULT_WEEKS - 1) * 7);
  return {
    from: bucketStart(from, granularity),
    to: addDays(nextBucket(bucketStart(to, granularity), granularity), -1),
    granularity,
    timeZone,
  };
}

// ---- figures ----

/** Linear interpolation between the closest ranks, like spreadsheets do. */
function quantile(sorted: number[], q: number): number {
  const position = (sorted.length - 1) * q;
  const lower = sorted[Math.floor(position)]!;
  const upper = sorted[Math.ceil(position)]!;
  return lower + (upper - lower) * (position - Math.floor(position));
}

export function durationStats(values: number[]): DurationStats {
  if (values.length === 0) return { count: 0, medianMs: null, p85Ms: null, meanMs: null };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    medianMs: quantile(sorted, 0.5),
    p85Ms: quantile(sorted, 0.85),
    meanMs: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
  };
}

/**
 * Every time a task enters Done: moved there from another column, or created right there. The cycle starts when a
 * task leaves the first column, or when it is created, if it was created further right; it is only known for tasks
 * whose creation is in the log.
 */
export function findCompletions(input: AnalyticsInput): (Omit<Completion, 'completedAt'> & { at: number })[] {
  const first = input.columns[0]?.id;
  const done = input.columns.at(-1)?.id;
  if (first === undefined || done === undefined) return [];

  const logged = new Map<number, number>(); // creation time per task, if logged
  const started = new Map<number, number>();
  const completions: (Omit<Completion, 'completedAt'> & { at: number })[] = [];
  const createdAt = (taskId: number) => input.tasks.get(taskId)?.createdAt ?? logged.get(taskId) ?? null;
  const live = (taskId: number) => input.tasks.get(taskId)?.live ?? false;

  for (const event of input.events) {
    if (event.type === 'task-create') {
      logged.set(event.taskId, event.at);
      if (event.columnId !== first) started.set(event.taskId, createdAt(event.taskId)!);
      if (event.columnId === done) {
        // Created as done: counts as finished work, but there was no flow to time.
        const title = input.tasks.get(event.taskId)?.title ?? event.title;
        completions.push({ taskId: event.taskId, title, at: event.at, leadTimeMs: null, cycleTimeMs: null, live: live(event.taskId) });
      }
    } else if (event.type === 'task-move' && event.fromColumnId !== event.toColumnId) {
      if (logged.has(event.taskId) && !started.has(event.taskId)) started.set(event.taskId, event.at);
      if (event.toColumnId === done) {
        const created = createdAt(event.taskId);
        const start = started.get(event.taskId);
        completions.push({
          taskId: event.taskId,
          title: input.tasks.get(event.taskId)?.title ?? event.title,
          at: event.at,
          leadTimeMs: created === null ? null : Math.max(0, event.at - created),
          cycleTimeMs: start === undefined ? null : Math.max(0, event.at - start),
          live: live(event.taskId),
        });
      }
    }
  }
  return completions;
}

type Step = { at: number; value: number | null };

/**
 * Task count and limit of every column over time. Today's counts are exact; going back, each logged change is undone,
 * so the counts at the coverage start do not depend on tasks created before the log began.
 */
export function wipHistory(input: AnalyticsInput, windowStart: number, windowEnd: number): WipColumn[] {
  if (input.coverageStart === null) return [];
  const start = Math.max(windowStart, input.coverageStart);
  const end = Math.min(windowEnd, input.now);

  const names = new Map(input.columns.map((column) => [column.id, column.name]));
  const idByName = new Map(input.columns.map((column) => [column.name.toLocaleLowerCase('de'), column.id]));
  const deltas: { at: number; columnId: number; delta: number }[] = [];
  const limitChanges = new Map<number, { at: number; from: number | null; to: number | null }[]>();
  const add = (at: number, columnId: number | null | undefined, delta: number) => {
    if (columnId != null && delta !== 0) deltas.push({ at, columnId, delta });
  };

  for (const event of input.events) {
    switch (event.type) {
      case 'task-create':
        add(event.at, event.columnId, 1);
        break;
      case 'task-move':
        if (event.fromColumnId !== event.toColumnId) {
          add(event.at, event.fromColumnId, -1);
          add(event.at, event.toColumnId, 1);
        }
        break;
      case 'task-trash':
      case 'task-restore':
        add(event.at, event.columnId ?? idByName.get(event.columnName.toLocaleLowerCase('de')), event.type === 'task-trash' ? -1 : 1);
        break;
      case 'wip-limit':
        limitChanges.set(event.columnId, [...(limitChanges.get(event.columnId) ?? []), event]);
        break;
      case 'column-delete':
        if (!names.has(event.columnId)) names.set(event.columnId, event.name);
        add(event.at, event.columnId, -event.movedTasks);
        add(event.at, event.targetId, event.movedTasks);
        break;
    }
  }
  // Log order is nearly time order; an entry rewritten by a later edit can come late.
  deltas.sort((a, b) => a.at - b.at);

  const columns: WipColumn[] = [];
  for (const [columnId, name] of names) {
    const current = input.columns.find((column) => column.id === columnId);
    const own = deltas.filter((d) => d.columnId === columnId);
    let count = (input.taskCounts.get(columnId) ?? 0) - own.reduce((sum, d) => sum + d.delta, 0);
    const counts: Step[] = [{ at: input.coverageStart, value: count }];
    for (const d of own) counts.push({ at: d.at, value: (count += d.delta) });

    const changes = limitChanges.get(columnId) ?? [];
    const limits: Step[] = [{ at: input.coverageStart, value: changes[0] ? changes[0].from : (current?.wipLimit ?? null) }];
    for (const change of changes) limits.push({ at: change.at, value: change.to });

    const summary = evaluate(counts, limits, start, end);
    if (summary.hadLimit) {
      columns.push({ id: columnId, name, exists: current !== undefined, wipLimit: current?.wipLimit ?? null, ...summary.result });
    }
  }
  // Board order, deleted columns last.
  const order = (id: number) => {
    const index = input.columns.findIndex((column) => column.id === id);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  return columns.sort((a, b) => order(a.id) - order(b.id));
}

function evaluate(counts: Step[], limits: Step[], start: number, end: number) {
  const empty = { episodes: 0, overLimitMs: 0, peakOver: 0, series: [] as WipPoint[] };
  if (start >= end) return { hadLimit: false, result: empty };

  // All change times inside the window, plus its start; several changes at one instant count as one.
  const times = [...new Set([start, ...[...counts, ...limits].map((s) => s.at).filter((at) => at > start && at < end)])].sort(
    (a, b) => a - b,
  );
  const valueAt = (steps: Step[], at: number) => {
    let value: number | null = null;
    for (const step of steps) if (step.at <= at) value = step.value;
    return value;
  };

  const result = { ...empty, series: [] as WipPoint[] };
  let hadLimit = false;
  let wasOver = false;
  times.forEach((at, i) => {
    // Counts can only go below zero when old log entries could not be matched to a column.
    const count = Math.max(0, valueAt(counts, at) ?? 0);
    const limit = valueAt(limits, at);
    const until = times[i + 1] ?? end;
    const last = result.series.at(-1);
    if (!last || last.count !== count || last.limit !== limit) result.series.push({ at: new Date(at).toISOString(), count, limit });

    if (limit !== null) hadLimit = true;
    const over = limit !== null && count > limit;
    if (over) {
      if (!wasOver) result.episodes++;
      result.overLimitMs += until - at;
      result.peakOver = Math.max(result.peakOver, count - limit);
    }
    wasOver = over;
  });
  const last = result.series.at(-1)!;
  result.series.push({ ...last, at: new Date(end).toISOString() });
  return { hadLimit, result };
}

export function buildReport(input: AnalyticsInput, range: AnalyticsRange): AnalyticsReport {
  const { granularity, timeZone } = range;
  const windowStart = startOfDay(range.from, timeZone);
  const windowEnd = startOfDay(addDays(range.to, 1), timeZone);
  const inRange = (at: number) => at >= windowStart && at < windowEnd;

  const buckets: string[] = [];
  for (let start = range.from; start <= range.to; start = nextBucket(start, granularity)) buckets.push(start);
  const covered = (start: string) =>
    input.coverageStart !== null && startOfDay(nextBucket(start, granularity), timeZone) > input.coverageStart;
  const velocity: VelocityBucket[] = buckets.map((start) =>
    covered(start) ? { start, completed: 0, created: 0 } : { start, completed: null, created: null },
  );
  const bucketOf = (at: number) => velocity[buckets.indexOf(bucketStart(localDate(at, timeZone), granularity))];

  const completions = findCompletions(input).filter((c) => inRange(c.at));
  for (const completion of completions) {
    const bucket = bucketOf(completion.at);
    if (bucket?.completed != null) bucket.completed++;
  }

  // Creation times from the tasks table, and from the log for purged tasks.
  const created = new Map([...input.tasks].map(([id, task]) => [id, task.createdAt]));
  for (const event of input.events) {
    if (event.type === 'task-create' && !created.has(event.taskId)) created.set(event.taskId, event.at);
  }
  for (const at of created.values()) {
    const bucket = inRange(at) ? bucketOf(at) : undefined;
    if (bucket?.created != null) bucket.created++;
  }

  const done = input.columns.at(-1);
  const sum = (key: 'completed' | 'created') => velocity.reduce((total, bucket) => total + (bucket[key] ?? 0), 0);
  return {
    range,
    doneColumn: done ? { id: done.id, name: done.name } : null,
    coverageStart: input.coverageStart === null ? null : new Date(input.coverageStart).toISOString(),
    totals: { completed: sum('completed'), created: sum('created') },
    velocity,
    leadTime: durationStats(completions.flatMap((c) => (c.leadTimeMs === null ? [] : [c.leadTimeMs]))),
    cycleTime: durationStats(completions.flatMap((c) => (c.cycleTimeMs === null ? [] : [c.cycleTimeMs]))),
    completions: completions.map(({ at, ...rest }) => ({ ...rest, completedAt: new Date(at).toISOString() })),
    wip: wipHistory(input, windowStart, windowEnd),
  };
}

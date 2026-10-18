/**
 * Slows down password guessing (US-21): at most `limit` failed attempts per key within `windowMs`. Kept in memory –
 * a restart forgets them, which is fine for a family or team server.
 */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const failures = new Map<string, number[]>();

  const recent = (key: string, now: number) => (failures.get(key) ?? []).filter((t) => now - t < windowMs);

  return {
    /** Seconds until the next attempt is allowed, or 0. */
    retryAfter(key: string, now = Date.now()): number {
      const times = recent(key, now);
      if (times.length < limit) return 0;
      return Math.ceil((windowMs - (now - times[0]!)) / 1000);
    },
    fail(key: string, now = Date.now()): void {
      const times = recent(key, now);
      times.push(now);
      failures.set(key, times);
      // Forget keys nobody tried for a while, so the map does not grow without end.
      if (failures.size > 10_000) for (const [k, t] of failures) if (!t.some((x) => now - x < windowMs)) failures.delete(k);
    },
    reset(key: string): void {
      failures.delete(key);
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;

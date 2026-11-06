import { Router, type Request } from 'express';
import { PRIORITY_LABELS } from '../activityText.js';
import type { Access } from '../auth/access.js';
import type { AuthMode } from '../auth/middleware.js';
import type { RateLimiter } from '../auth/rateLimit.js';
import { HttpError, notFound } from '../errors.js';
import { buildCalendar, type CalendarEvent } from '../ics.js';
import type { CalendarFeedsRepository, FeedTask } from '../repositories/calendarFeedsRepository.js';

/** `<token>.ics`: tokens are 32 random bytes in base64url (43 characters). */
const FEED_FILE = /^([A-Za-z0-9_-]{43})\.ics$/;

/** Where the app is reached from outside, for the links in the events; behind a proxy as it reports it. */
const originOf = (req: Request) => `${req.protocol}://${req.get('host') ?? 'localhost'}`;

/** A task as an all-day event from its start to its due date; with only one of them, on that day. */
export function taskEvent(task: FeedTask, origin: string): CalendarEvent {
  const first = task.startDate ?? task.dueDate!;
  const last = task.dueDate ?? task.startDate!;
  // A start after the due date is shown on the due date alone.
  const start = first <= last ? first : last;
  const url = `${origin}/p/${task.projectId}/tasks/${task.id}`;
  const details = [
    `Projekt: ${task.projectName}`,
    task.priority ? `Priorität: ${PRIORITY_LABELS[task.priority]}` : null,
    task.startDate && task.dueDate && task.startDate !== task.dueDate ? `Fällig am ${formatDay(task.dueDate)}` : null,
    task.done ? 'Erledigt' : null,
    url,
  ];
  return {
    uid: `task-${task.id}@scrumbanize`,
    start,
    end: last,
    summary: `${task.done ? '✓ ' : ''}${task.title}`,
    description: details.filter(Boolean).join('\n'),
    url,
    categories: [task.projectName],
    lastModified: task.updatedAt,
  };
}

const formatDay = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;

interface CalendarFeedRouterOptions {
  mode: AuthMode;
  calendarFeeds: CalendarFeedsRepository;
  access: Access;
  limiter: RateLimiter;
}

/**
 * The calendar subscription (US-33) at /api/calendar/feed/<token>.ics. Public: calendar apps have no session, the
 * secret link is the key. It shows the tasks with a date in every project the link's owner may see right now.
 * Wrong tokens count against the address like failed logins.
 */
export function calendarFeedRouter({ mode, calendarFeeds, access, limiter }: CalendarFeedRouterOptions): Router {
  const router = Router();

  router.get('/calendar/feed/:file', (req, res) => {
    const key = `calendar:${req.ip}`;
    const wait = limiter.retryAfter(key);
    if (wait) throw new HttpError(429, 'too_many_attempts', `Too many attempts; try again in ${wait} seconds`);
    const token = FEED_FILE.exec(String(req.params.file))?.[1];
    const userId = token ? calendarFeeds.ownerOf(token, mode === 'required') : undefined;
    if (userId === undefined) {
      limiter.fail(key);
      throw notFound();
    }
    const origin = originOf(req);
    const ics = buildCalendar({
      name: 'Scrumbanize',
      events: calendarFeeds.tasks(access.projectIds({ id: userId })).map((task) => taskEvent(task, origin)),
      now: new Date(),
    });
    res
      .set({
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="scrumbanize.ics"',
        // The link is a secret: no shared caches, and calendar apps ask again anyway.
        'Cache-Control': 'private, no-cache',
        'Referrer-Policy': 'no-referrer',
      })
      .send(ics);
  });

  return router;
}

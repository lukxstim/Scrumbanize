/**
 * A minimal iCalendar (RFC 5545) writer for the calendar subscription (US-33): all-day events, escaped text, lines
 * folded at 75 bytes and ended with CRLF, as calendar apps (Outlook, Google, Apple) expect.
 */

export interface CalendarEvent {
  /** Stays the same for the same task, so calendar apps update an event instead of adding another. */
  uid: string;
  /** First day, YYYY-MM-DD. */
  start: string;
  /** Last day (inclusive), YYYY-MM-DD; the same as `start` for a one-day event. */
  end: string;
  summary: string;
  description?: string;
  url?: string;
  categories?: string[];
  /** When the task last changed, ISO 8601. */
  lastModified?: string;
}

export interface Calendar {
  name: string;
  events: CalendarEvent[];
  /** The time the feed was made; DTSTAMP of every event. */
  now: Date;
}

/** Text values: backslash, semicolon, comma and line breaks are escaped. */
export function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

/** Splits a content line into pieces of at most 75 bytes (never inside a character); continuation lines start with a space. */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char, 'utf8');
    // The first line may hold 75 bytes; continuation lines 74, after their leading space.
    if (bytes + size > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const dateValue = (day: string) => day.replace(/-/g, '');
const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** The day after `day` (YYYY-MM-DD): DTEND of an all-day event is the first day after it. */
export function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function buildCalendar({ name, events, now }: Calendar): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Scrumbanize//Kalender-Abo//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    // How often calendar apps should look again; most decide themselves, some follow this.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${dateValue(event.start)}`,
      `DTEND;VALUE=DATE:${dateValue(nextDay(event.end))}`,
      `SUMMARY:${escapeText(event.summary)}`,
    );
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (event.url) lines.push(`URL:${event.url}`);
    if (event.categories?.length) lines.push(`CATEGORIES:${event.categories.map(escapeText).join(',')}`);
    if (event.lastModified) lines.push(`LAST-MODIFIED:${stamp(new Date(event.lastModified))}`);
    // An all-day task should not block the day as busy.
    lines.push('TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

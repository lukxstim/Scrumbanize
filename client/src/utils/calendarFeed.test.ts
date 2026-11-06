import { describe, expect, it } from 'vitest';
import { feedUrl, webcalUrl } from './calendarFeed';

describe('calendar feed address', () => {
  it('points to the feed on the same server', () => {
    expect(feedUrl('https://scrumbanize.onrender.com', 'abc_DEF-1')).toBe('https://scrumbanize.onrender.com/api/calendar/feed/abc_DEF-1.ics');
    expect(feedUrl('http://localhost:3000/', 'x')).toBe('http://localhost:3000/api/calendar/feed/x.ics');
  });

  it('opens calendar apps with webcal:', () => {
    expect(webcalUrl('https://a.example/api/calendar/feed/x.ics')).toBe('webcal://a.example/api/calendar/feed/x.ics');
    expect(webcalUrl('http://localhost:3000/f.ics')).toBe('webcal://localhost:3000/f.ics');
  });
});

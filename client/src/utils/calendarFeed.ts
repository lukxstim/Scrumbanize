/** The address of the calendar subscription (US-33) for a token, on the server the app runs on. */
export const feedUrl = (origin: string, token: string) => `${origin.replace(/\/+$/, '')}/api/calendar/feed/${encodeURIComponent(token)}.ics`;

/** The same address as webcal:, which opens the calendar app (Apple Kalender, Outlook) to subscribe. */
export const webcalUrl = (url: string) => url.replace(/^https?:/, 'webcal:');

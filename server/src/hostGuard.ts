import type { RequestHandler } from 'express';

/**
 * For the desktop app, whose server listens on 127.0.0.1 only. Rejects requests that were not made by
 * the app's own window:
 * - The Host header must be the local address. This blocks DNS rebinding, where a website points its own
 *   domain at 127.0.0.1 to reach the local server.
 * - A cross-site Origin or Sec-Fetch-Site header is rejected, so a website open in the user's browser
 *   cannot send requests to the local API. Requests without an Origin (navigations, same-origin GETs)
 *   are fine; browsers always send one for cross-site requests that change data.
 *
 * `trustedHosts` returns the allowed `host:port` values; it is read per request because the actual port
 * is only known once the server listens.
 */
export function hostGuard(trustedHosts: () => readonly string[]): RequestHandler {
  return (req, res, next) => {
    const hosts = trustedHosts();
    const host = req.headers.host?.toLowerCase();
    const origin = req.headers.origin?.toLowerCase();
    const fetchSite = req.headers['sec-fetch-site'];

    const trustedOrigin = origin === undefined || hosts.some((h) => origin === `http://${h}`);
    if (!host || !hosts.includes(host) || !trustedOrigin || fetchSite === 'cross-site') {
      res.status(403).json({ error: { code: 'forbidden_origin', message: 'Requests are only accepted from the Scrumbanize app' } });
      return;
    }
    next();
  };
}

/** The host:port values under which a server on 127.0.0.1:`port` is reached by its own window. */
export function loopbackHosts(port: number): string[] {
  return [`127.0.0.1:${port}`, `localhost:${port}`];
}

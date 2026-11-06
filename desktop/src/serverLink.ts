/**
 * The online server the desktop app can work with instead of its own database (US-31): then the window shows the
 * server's Scrumbanize, with its login, and every computer and the browser see the same data. Kept apart from
 * Electron so it can be tested.
 */

export type ServerUrlError = 'invalid_url' | 'insecure';
export type ServerCheckError = ServerUrlError | 'unreachable' | 'not_scrumbanize' | 'unhealthy';

/** Private and local addresses, where plain http is acceptable (a server at home); elsewhere only https. */
const PRIVATE_HOST = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|[a-z0-9-]+\.local)$/i;

/** "scrumbanize.onrender.com/irgendwas" → "https://scrumbanize.onrender.com": only the origin counts. */
export function normalizeServerUrl(input: string): { ok: true; url: string } | { ok: false; error: ServerUrlError } {
  const text = input.trim();
  if (!text) return { ok: false, error: 'invalid_url' };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, error: 'invalid_url' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, error: 'invalid_url' };
  if (!url.hostname || url.username || url.password) return { ok: false, error: 'invalid_url' };
  if (url.protocol === 'http:' && !PRIVATE_HOST.test(url.hostname)) return { ok: false, error: 'insecure' };
  return { ok: true, url: url.origin };
}

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** Asks the server's health check whether a working Scrumbanize answers there, and which version. */
export async function checkServer(url: string, fetcher: Fetch, timeoutMs = 10_000): Promise<{ ok: true; version: string | null } | { ok: false; error: ServerCheckError }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetcher(`${url}/api/health`, { signal: controller.signal });
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { ok: false, error: 'not_scrumbanize' };
    }
    const report = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    if (typeof report.status !== 'string' || !('database' in report)) return { ok: false, error: 'not_scrumbanize' };
    if (!res.ok || report.database !== 'ok') return { ok: false, error: 'unhealthy' };
    return { ok: true, version: typeof report.version === 'string' ? report.version : null };
  } catch {
    return { ok: false, error: 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

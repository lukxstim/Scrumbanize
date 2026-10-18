import type { Request, RequestHandler, Response } from 'express';
import { HttpError } from '../errors.js';
import type { User, UsersRepository } from '../repositories/usersRepository.js';
import { runAsUser } from './currentUser.js';

/**
 * How the server knows who is asking (US-21):
 * - `local`: the desktop app and `AUTH=off`. Everyone is the local user; nothing to log in to.
 * - `required`: web and Docker. A session cookie from logging in.
 */
export type AuthMode = 'local' | 'required';

export const SESSION_COOKIE = 'scrumbanize_session';

/** The user of this request; undefined until `authenticate` found one. */
export const userOf = (res: Response) => res.locals.user as User | undefined;

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return undefined;
}

export const sessionTokenOf = (req: Request) => readCookie(req, SESSION_COOKIE);

/**
 * HttpOnly, so scripts on the page never see it; SameSite=Lax, so other sites cannot send it along with requests
 * that change something; Secure over HTTPS (req.secure honours TRUST_PROXY behind a reverse proxy).
 */
export function setSessionCookie(req: Request, res: Response, token: string, expires: Date): void {
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/', expires });
}

export function clearSessionCookie(req: Request, res: Response): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/' });
}

/**
 * Finds the user of the request (local user, or the session's) and runs the rest of the request as them, so
 * repositories can see who acts (currentUser.ts). A request without a valid session simply has no user.
 */
export function authenticate(mode: AuthMode, users: UsersRepository): RequestHandler {
  return (req, res, next) => {
    let user: User | undefined;
    if (mode === 'local') {
      user = users.localUser();
    } else {
      const token = sessionTokenOf(req);
      const session = token ? users.sessionUser(token) : undefined;
      if (session?.renewed) setSessionCookie(req, res, token!, session.renewed);
      user = session?.user;
    }
    res.locals.user = user;
    if (user) runAsUser(user.id, next);
    else next();
  };
}

export const requireAuth: RequestHandler = (_req, res, next) => {
  if (!userOf(res)) throw new HttpError(401, 'unauthenticated', 'Please log in');
  next();
};

/**
 * Changes must come from the app's own pages: with a cookie session, another website could otherwise make the
 * browser send them. SameSite=Lax already keeps the cookie off cross-site POSTs; this also refuses them when a
 * browser sends the cookie anyway. Allowed: no Origin (not a browser), the address the request was sent to, and
 * `allowedOrigins` (BASE_URL, e.g. behind a proxy that changes the host).
 */
export function sameOriginForChanges(allowedOrigins: readonly string[] = []): RequestHandler {
  return (req, _res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    const fetchSite = req.headers['sec-fetch-site'];
    const origin = req.headers.origin;
    const ownOrigin = `${req.protocol}://${req.host}`;
    const allowed =
      fetchSite !== 'cross-site' &&
      fetchSite !== 'same-site' &&
      (origin === undefined || origin === ownOrigin || allowedOrigins.includes(origin));
    if (!allowed) throw new HttpError(403, 'forbidden_origin', 'Requests are only accepted from Scrumbanize itself');
    next();
  };
}

import { Router, type Request, type Response } from 'express';
import type { AuthMode } from '../auth/middleware.js';
import { clearSessionCookie, sessionTokenOf, setSessionCookie, userOf } from '../auth/middleware.js';
import { hashPassword, timingDummyHash, verifyPassword } from '../auth/passwords.js';
import type { RateLimiter } from '../auth/rateLimit.js';
import type { SetupCode } from '../auth/setupCode.js';
import { HttpError } from '../errors.js';
import type { UsersRepository } from '../repositories/usersRepository.js';
import { accessChanged } from '../realtime/events.js';
import { loginSchema, registerSchema, resetPasswordSchema, setupSchema } from '../validation.js';

interface AuthRouterOptions {
  mode: AuthMode;
  users: UsersRepository;
  setupCode: SetupCode;
  /** Failed logins per IP address and per email, and failed setup codes per IP. */
  limiter: RateLimiter;
}

function tooMany(seconds: number): HttpError {
  return new HttpError(429, 'too_many_attempts', `Too many attempts; try again in ${seconds} seconds`);
}

/** Login, logout, the setup of the first administrator and who is logged in (US-21), at /api/auth. Public. */
export function authRouter({ mode, users, setupCode, limiter }: AuthRouterOptions): Router {
  const router = Router();
  const ipKey = (req: Request) => `ip:${req.ip ?? 'unknown'}`;

  function login(req: Request, res: Response, userId: number) {
    const { token, expiresAt } = users.createSession(userId, req.headers['user-agent']);
    setSessionCookie(req, res, token, expiresAt);
  }

  // What the app needs to decide between setup, login and itself. Asking for it also prints the setup code if the
  // server needs one (e.g. after a restore removed the last administrator).
  router.get('/session', (_req, res) => {
    const setupRequired = mode === 'required' && users.setupRequired();
    if (setupRequired) setupCode.current();
    res.json({ mode, setupRequired, user: userOf(res) ?? null });
  });

  router.post('/setup', async (req, res) => {
    if (mode !== 'required' || !users.setupRequired()) throw new HttpError(409, 'setup_done', 'Scrumbanize is already set up');
    const wait = limiter.retryAfter(ipKey(req));
    if (wait) throw tooMany(wait);
    const input = setupSchema.parse(req.body);
    if (!setupCode.matches(input.code)) {
      limiter.fail(ipKey(req));
      throw new HttpError(403, 'wrong_setup_code', 'The setup code is wrong');
    }
    const passwordHash = await hashPassword(input.password);
    // Checked again inside the transaction: two setups at once must not both succeed.
    const user = users.createFirstAdmin({ email: input.email, name: input.name, passwordHash });
    if (!user) throw new HttpError(409, 'setup_done', 'Scrumbanize is already set up');
    setupCode.clear();
    limiter.reset(ipKey(req));
    login(req, res, user.id);
    res.status(201).json({ user });
  });

  router.post('/login', async (req, res) => {
    if (mode !== 'required') throw new HttpError(409, 'no_login', 'This installation has no login');
    const { email, password } = loginSchema.parse(req.body);
    const emailKey = `email:${email.toLowerCase()}`;
    const wait = Math.max(limiter.retryAfter(ipKey(req)), limiter.retryAfter(emailKey));
    if (wait) throw tooMany(wait);

    const candidate = users.loginCandidate(email);
    // Without an account, still check against a hash, so the answer takes as long as for a wrong password.
    const ok = await verifyPassword(password, candidate?.passwordHash ?? (await timingDummyHash()));
    if (!candidate || !ok) {
      limiter.fail(ipKey(req));
      limiter.fail(emailKey);
      throw new HttpError(401, 'wrong_credentials', 'Email or password is wrong');
    }
    limiter.reset(emailKey);
    login(req, res, candidate.user.id);
    res.json({ user: candidate.user });
  });

  // One-time links (US-21c). The tokens are 256 random bits, so there is nothing to guess; a used or expired link
  // simply no longer works (410).
  const gone = () => new HttpError(410, 'invalid_link', 'This link is no longer valid');

  /** What the invitation page shows before the account is created. */
  router.get('/invitation/:token', (req, res) => {
    const found = mode === 'required' ? users.findToken(String(req.params.token), 'invite') : undefined;
    if (!found) throw gone();
    res.json({ email: found.email });
  });

  /** Accepting an invitation: the account is created with the invited email and logged in. */
  router.post('/register', async (req, res) => {
    if (mode !== 'required') throw new HttpError(409, 'no_login', 'This installation has no login');
    const { token, name, password } = registerSchema.parse(req.body);
    const found = users.findToken(token, 'invite');
    if (!found) throw gone();
    if (users.accounts().some((a) => a.email === found.email)) {
      throw new HttpError(409, 'email_taken', 'There is already an account with this email');
    }
    const user = users.register(token, { email: found.email, name, passwordHash: await hashPassword(password) });
    if (!user) throw gone();
    login(req, res, user.id);
    res.status(201).json({ user });
  });

  router.get('/reset/:token', (req, res) => {
    const found = mode === 'required' ? users.findToken(String(req.params.token), 'reset') : undefined;
    if (!found) throw gone();
    res.json({ email: found.email, name: found.user!.name });
  });

  /** A new password from a reset link: every session of the account ends, then this browser is logged in. */
  router.post('/reset', async (req, res) => {
    if (mode !== 'required') throw new HttpError(409, 'no_login', 'This installation has no login');
    const { token, password } = resetPasswordSchema.parse(req.body);
    const found = users.findToken(token, 'reset');
    if (!found) throw gone();
    const passwordHash = await hashPassword(password);
    if (!users.useToken(token)) throw gone();
    users.setPassword(found.user!.id, passwordHash);
    login(req, res, found.user!.id);
    res.json({ user: users.get(found.user!.id) });
  });

  router.post('/logout', (req, res) => {
    const token = sessionTokenOf(req);
    if (token) users.deleteSession(token);
    clearSessionCookie(req, res);
    // Other tabs of this session end their live connection now, not at the next check.
    const user = userOf(res);
    if (user) accessChanged(res, [user.id]);
    res.status(204).end();
  });

  return router;
}

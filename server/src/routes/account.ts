import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { Router } from 'express';
import type { AuthMode } from '../auth/middleware.js';
import { sessionTokenOf, userOf } from '../auth/middleware.js';
import { hashPassword, verifyPassword } from '../auth/passwords.js';
import type { RateLimiter } from '../auth/rateLimit.js';
import { HttpError, notFound } from '../errors.js';
import type { CalendarFeedsRepository } from '../repositories/calendarFeedsRepository.js';
import type { UsersRepository } from '../repositories/usersRepository.js';
import { accessChanged } from '../realtime/events.js';
import { idParamSchema, passwordChangeSchema, profilePatchSchema } from '../validation.js';

/** Largest profile picture; the app shrinks pictures to 256 × 256 before uploading, so this is generous. */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const AVATAR_TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' } as const;
type AvatarExtension = keyof typeof AVATAR_TYPES;

/**
 * The image format by the file's first bytes, not by what the browser claims. Only PNG, JPEG and WebP: SVG could
 * carry script, and other formats are not needed for a small picture.
 */
export function detectAvatarType(data: Buffer): AvatarExtension | undefined {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'jpg';
  if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return undefined;
}

interface AccountRouterOptions {
  mode: AuthMode;
  users: UsersRepository;
  uploadsDir: string;
  limiter: RateLimiter;
  calendarFeeds: CalendarFeedsRepository;
}

/**
 * The logged-in user's own account (US-21c), at /api/account: name, color, profile picture, password. Pictures are
 * files in the uploads folder (named `avatar-…`), so backups include them.
 */
export function accountRouter({ mode, users, uploadsDir, limiter, calendarFeeds }: AccountRouterOptions): Router {
  const router = Router();
  const removeFile = (file: string | null) => {
    if (file) fs.rmSync(path.join(uploadsDir, file), { force: true });
  };

  router.patch('/', (req, res) => {
    res.json({ user: users.updateProfile(userOf(res)!.id, profilePatchSchema.parse(req.body)) });
  });

  /** Needs the current password; every other session of the account ends (e.g. a forgotten logged-in laptop). */
  router.post('/password', async (req, res) => {
    if (mode !== 'required') throw new HttpError(409, 'no_login', 'This installation has no login');
    const user = userOf(res)!;
    const key = `password:${user.id}`;
    const wait = limiter.retryAfter(key);
    if (wait) throw new HttpError(429, 'too_many_attempts', `Too many attempts; try again in ${wait} seconds`);
    const { current, password } = passwordChangeSchema.parse(req.body);
    if (!(await verifyPassword(current, users.passwordHashOf(user.id) ?? ''))) {
      limiter.fail(key);
      throw new HttpError(403, 'wrong_password', 'The current password is wrong');
    }
    limiter.reset(key);
    users.setPassword(user.id, await hashPassword(password), sessionTokenOf(req));
    // The ended sessions' open pages lose their live connection too.
    accessChanged(res, [user.id]);
    res.status(204).end();
  });

  /** The picture as the request body (image/png, image/jpeg or image/webp). */
  router.put('/avatar', express.raw({ type: () => true, limit: MAX_AVATAR_BYTES }), (req, res) => {
    const data = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const type = detectAvatarType(data);
    if (!type) throw new HttpError(415, 'unsupported_image', 'Only PNG, JPEG or WebP pictures');
    const file = `avatar-${randomUUID()}.${type}`;
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, file), data);
    removeFile(users.setAvatarFile(userOf(res)!.id, file));
    res.json({ user: users.get(userOf(res)!.id) });
  });

  router.delete('/avatar', (_req, res) => {
    removeFile(users.setAvatarFile(userOf(res)!.id, null));
    res.json({ user: users.get(userOf(res)!.id) });
  });

  // The calendar subscription (US-33): whether there is a link, a new one (its token only in this answer), or none.
  router.get('/calendar', (_req, res) => {
    res.json({ feed: calendarFeeds.status(userOf(res)!.id) });
  });

  router.post('/calendar', (_req, res) => {
    res.status(201).json(calendarFeeds.renew(userOf(res)!.id));
  });

  router.delete('/calendar', (_req, res) => {
    calendarFeeds.revoke(userOf(res)!.id);
    res.status(204).end();
  });

  return router;
}

/**
 * Profile pictures at /api/users/:id/avatar: for the person themselves, administrators, and people who share a
 * project with them – the ones who see their name in members lists and the activity log.
 */
export function avatarsRouter({ mode, users, uploadsDir }: Pick<AccountRouterOptions, 'mode' | 'users' | 'uploadsDir'>): Router {
  const router = Router();

  router.get('/:id/avatar', (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const me = userOf(res)!;
    const allowed = mode === 'local' || me.id === id || me.systemRole === 'admin' || users.shareAProject(me.id, id);
    const file = allowed ? users.avatarFileOf(id) : null;
    if (!file) throw notFound('No picture');
    const extension = path.extname(file).slice(1) as AvatarExtension;
    res.setHeader('Content-Type', AVATAR_TYPES[extension] ?? 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    // The URL carries the file name, so a new picture is a new address and this one never changes.
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.sendFile(path.join(uploadsDir, file), (error) => {
      if (error && !res.headersSent) res.status(404).json({ error: { code: 'not_found', message: 'File missing' } });
    });
  });

  return router;
}

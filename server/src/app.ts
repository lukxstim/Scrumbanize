import fs from 'node:fs';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import express from 'express';
import type { Db } from './database.js';
import { createAccess } from './auth/access.js';
import { currentUserId } from './auth/currentUser.js';
import { setVisibility } from './auth/visibility.js';
import { authenticate, requireAuth, sameOriginForChanges, type AuthMode } from './auth/middleware.js';
import { createRateLimiter } from './auth/rateLimit.js';
import { createSetupCode } from './auth/setupCode.js';
import { backupsDirOf, createRestoreService } from './backup.js';
import { apiNotFoundHandler, errorHandler } from './errors.js';
import { healthReport } from './health.js';
import { hostGuard } from './hostGuard.js';
import { createActivityRepository } from './repositories/activityRepository.js';
import { createAnalyticsRepository } from './repositories/analyticsRepository.js';
import { createAttachmentsRepository } from './repositories/attachmentsRepository.js';
import { createBoardRepository } from './repositories/boardRepository.js';
import { createGraphRepository } from './repositories/graphRepository.js';
import { createLabelsRepository } from './repositories/labelsRepository.js';
import { createMetaRepository } from './repositories/metaRepository.js';
import { createNotesRepository } from './repositories/notesRepository.js';
import { createFoldersRepository } from './repositories/foldersRepository.js';
import { createContentLinksRepository } from './repositories/contentLinksRepository.js';
import { createProjectsRepository } from './repositories/projectsRepository.js';
import { createRemindersRepository } from './repositories/remindersRepository.js';
import { createSearchRepository } from './repositories/searchRepository.js';
import { createTasksRepository } from './repositories/tasksRepository.js';
import { createTemplatesRepository } from './repositories/templatesRepository.js';
import { createTrashRepository } from './repositories/trashRepository.js';
import { createUsersRepository } from './repositories/usersRepository.js';
import { accountRouter, avatarsRouter } from './routes/account.js';
import { adminRouter } from './routes/admin.js';
import { attachmentsRouter } from './routes/attachments.js';
import { authRouter } from './routes/auth.js';
import { backupRouter } from './routes/backup.js';
import { columnsRouter, lanesRouter } from './routes/board.js';
import { exportsRouter } from './routes/exports.js';
import { labelsRouter } from './routes/labels.js';
import { membersRouter } from './routes/members.js';
import { notesRouter, tagsRouter } from './routes/notes.js';
import { foldersRouter } from './routes/folders.js';
import { linksRouter } from './routes/links.js';
import { projectScopedRouter } from './routes/projectScoped.js';
import { projectsRouter } from './routes/projects.js';
import { remindersRouter } from './routes/reminders.js';
import { searchRouter } from './routes/search.js';
import { tasksRouter } from './routes/tasks.js';
import { trashRouter } from './routes/trash.js';

export interface DesktopInfo {
  version: string;
  releasesUrl: string;
}

export interface AppOptions {
  /** Directory with the built client. When it contains an index.html, the server also serves the app. */
  clientDist?: string;
  /** If given, only requests for these host:port values from the same origin are accepted (desktop app). */
  trustedHosts?: () => readonly string[];
  /** Set by the desktop app: its version and where new versions are published (for the update reminder). */
  desktop?: DesktopInfo;
  /** Folder for attachment files (`<dataDir>/uploads`); backups use its parent. Tests may leave it out and get a throwaway folder. */
  uploadsDir?: string;
  /**
   * `required`: log in with email and password (web, Docker). `local`: everyone is the local user, as in the desktop
   * app and with `AUTH=off`. Defaults to `local`, which existing tests rely on; startServer always passes it.
   */
  auth?: AuthMode;
  /** Where the setup code for the first administrator goes (the server's output). */
  onSetupCode?: (code: string) => void;
  /** Further origins whose pages may send changes, e.g. BASE_URL behind a proxy. */
  allowedOrigins?: readonly string[];
  /** Express "trust proxy": behind a reverse proxy, so the client's address and HTTPS are seen correctly. */
  trustProxy?: boolean | number | string;
  /** The app's version, reported by /api/health (US-23). */
  version?: string;
}

export function createApp(db: Db, options: AppOptions = {}): express.Express {
  const app = express();
  const notes = createNotesRepository(db);
  const folders = createFoldersRepository(db);
  const tasks = createTasksRepository(db);
  const board = createBoardRepository(db);
  const projects = createProjectsRepository(db);
  const search = createSearchRepository(db);
  const activities = createActivityRepository(db);
  const analytics = createAnalyticsRepository(db);
  const graph = createGraphRepository(db);
  const labels = createLabelsRepository(db);
  const templates = createTemplatesRepository(db);
  const trash = createTrashRepository(db);
  const meta = createMetaRepository(db);
  const reminders = createRemindersRepository(db);
  const users = createUsersRepository(db);
  const authMode = options.auth ?? 'local';
  const setupCode = createSetupCode(options.onSetupCode ?? (() => {}));
  const access = createAccess(db, authMode);
  // Links and tasks pointing into other projects show only what the request's user may see (US-22).
  setVisibility(db, () => {
    const userId = currentUserId();
    return userId === undefined ? null : access.projectIds({ id: userId });
  });
  const contentLinks = createContentLinksRepository(db);
  // 10 failed attempts per 15 minutes, per IP address and per email.
  const limiter = createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });
  if (authMode === 'required' && users.setupRequired()) setupCode.current();
  // Backups and restores work next to the uploads folder (in the data directory), so the fallback gets its own parent.
  const uploadsDir = options.uploadsDir ?? path.join(os.tmpdir(), `scrumbanize-${randomUUID()}`, 'uploads');
  const attachments = createAttachmentsRepository(db, uploadsDir);
  // Files left behind by purges or a crash.
  attachments.sweep();
  const restore = createRestoreService({
    db,
    uploadsDir,
    onRestored: () => {
      attachments.sweep();
      // Other open windows notice this (GET /api/meta) and ask to reload.
      meta.set('restored_at', new Date().toISOString());
    },
  });

  app.disable('x-powered-by');
  if (options.trustProxy !== undefined) app.set('trust proxy', options.trustProxy);
  // Before everything else, so rejected requests reach neither the API nor the static files.
  if (options.trustedHosts) app.use(hostGuard(options.trustedHosts));
  app.use(express.json({ limit: '2mb' }));

  const api = express.Router();
  // Status of database and backup folder (US-23): 503 only if the database does not answer, so a full or read-only
  // backup folder shows up in monitoring without Docker restarting a working app. Public, and before the session
  // check, which needs the database itself (and would renew a session with every probe).
  const backupsDir = backupsDirOf(path.dirname(uploadsDir));
  api.get('/health', (_req, res) => {
    const report = healthReport(db, backupsDir, options.version ?? null);
    res.status(report.database === 'ok' ? 200 : 503).json(report);
  });
  // With a session cookie, only the app's own pages may change something.
  if (authMode === 'required') api.use(sameOriginForChanges(options.allowedOrigins));
  api.use(authenticate(authMode, users));
  // Public: login and setup. Everything after requireAuth needs a logged-in user (US-21).
  api.use('/auth', authRouter({ mode: authMode, users, setupCode, limiter }));
  api.use(requireAuth);
  // Facts about the installation; `sampleProjectId` is null once the sample project was deleted, `desktop` is
  // null outside the desktop app.
  api.get('/meta', (_req, res) => {
    res.json({ sampleProjectId: meta.sampleProjectId(), desktop: options.desktop ?? null, restoredAt: meta.get('restored_at') ?? null });
  });
  // The user's own account, profile pictures, and user management for administrators (US-21c).
  api.use('/account', accountRouter({ mode: authMode, users, uploadsDir, limiter }));
  api.use('/users', avatarsRouter({ mode: authMode, users, uploadsDir }));
  api.use('/admin', adminRouter(users, access));
  // Every route below checks the user's role in the project it touches (auth/access.ts, US-21).
  api.use('/projects', projectsRouter(projects, access));
  api.use('/projects/:projectId/members', membersRouter(users, activities, access));
  api.use('/projects/:projectId', projectScopedRouter({ access, activities, analytics, graph, labels, templates, projects, notes, tasks, board, folders }));
  api.use('/notes', notesRouter(notes, folders, access));
  api.use('/tags', tagsRouter(notes, access));
  api.use('/folders', foldersRouter(folders, access));
  api.use(linksRouter(contentLinks, access));
  api.use('/tasks', tasksRouter(tasks, access));
  api.use('/columns', columnsRouter(board, access));
  api.use('/lanes', lanesRouter(board, access));
  api.use('/labels', labelsRouter(labels, access));
  api.use('/search', searchRouter(search, access));
  api.use('/reminders', remindersRouter(reminders, access));
  api.use('/trash', trashRouter(trash, projects, () => attachments.sweep(), access));
  api.use(attachmentsRouter(attachments, access));
  api.use('/backup', backupRouter(db, uploadsDir, restore, access));
  api.use(exportsRouter({ access, projects, notes, tasks, board, attachments }));
  api.use(apiNotFoundHandler);
  app.use('/api', api);

  const { clientDist } = options;
  if (clientDist && fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist, { index: false }));
    app.get('/{*path}', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}

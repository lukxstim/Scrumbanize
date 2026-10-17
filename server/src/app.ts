import fs from 'node:fs';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import express from 'express';
import type { Db } from './database.js';
import { apiNotFoundHandler, errorHandler } from './errors.js';
import { hostGuard } from './hostGuard.js';
import { createActivityRepository } from './repositories/activityRepository.js';
import { createAnalyticsRepository } from './repositories/analyticsRepository.js';
import { createAttachmentsRepository } from './repositories/attachmentsRepository.js';
import { createBoardRepository } from './repositories/boardRepository.js';
import { createMetaRepository } from './repositories/metaRepository.js';
import { createNotesRepository } from './repositories/notesRepository.js';
import { createProjectsRepository } from './repositories/projectsRepository.js';
import { createSearchRepository } from './repositories/searchRepository.js';
import { createTasksRepository } from './repositories/tasksRepository.js';
import { createTrashRepository } from './repositories/trashRepository.js';
import { attachmentsRouter } from './routes/attachments.js';
import { columnsRouter, lanesRouter } from './routes/board.js';
import { notesRouter } from './routes/notes.js';
import { projectScopedRouter } from './routes/projectScoped.js';
import { projectsRouter } from './routes/projects.js';
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
  /** Folder for attachment files (`<dataDir>/uploads`). Tests may leave it out and get a throwaway folder. */
  uploadsDir?: string;
}

export function createApp(db: Db, options: AppOptions = {}): express.Express {
  const app = express();
  const notes = createNotesRepository(db);
  const tasks = createTasksRepository(db);
  const board = createBoardRepository(db);
  const projects = createProjectsRepository(db);
  const search = createSearchRepository(db);
  const activities = createActivityRepository(db);
  const analytics = createAnalyticsRepository(db);
  const trash = createTrashRepository(db);
  const meta = createMetaRepository(db);
  const attachments = createAttachmentsRepository(
    db,
    options.uploadsDir ?? path.join(os.tmpdir(), `scrumbanize-uploads-${randomUUID()}`),
  );
  // Files left behind by purges or a crash.
  attachments.sweep();

  app.disable('x-powered-by');
  // Before everything else, so rejected requests reach neither the API nor the static files.
  if (options.trustedHosts) app.use(hostGuard(options.trustedHosts));
  app.use(express.json({ limit: '2mb' }));

  const api = express.Router();
  api.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  // Facts about the installation; `sampleProjectId` is null once the sample project was deleted, `desktop` is
  // null outside the desktop app.
  api.get('/meta', (_req, res) => {
    res.json({ sampleProjectId: meta.sampleProjectId(), desktop: options.desktop ?? null });
  });
  api.use('/projects', projectsRouter(projects));
  api.use('/projects/:projectId', projectScopedRouter({ activities, analytics, projects, notes, tasks, board }));
  api.use('/notes', notesRouter(notes));
  api.use('/tasks', tasksRouter(tasks));
  api.use('/columns', columnsRouter(board));
  api.use('/lanes', lanesRouter(board));
  api.use('/search', searchRouter(search));
  api.use('/trash', trashRouter(trash, projects, () => attachments.sweep()));
  api.use(attachmentsRouter(attachments));
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

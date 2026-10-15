import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Db } from './database.js';
import { apiNotFoundHandler, errorHandler } from './errors.js';
import { createNotesRepository } from './repositories/notesRepository.js';
import { notesRouter } from './routes/notes.js';
import { tagsRouter } from './routes/tags.js';

export interface AppOptions {
  /** Directory with the built client. When it contains an index.html, the server also serves the app. */
  clientDist?: string;
}

export function createApp(db: Db, options: AppOptions = {}): express.Express {
  const app = express();
  const notes = createNotesRepository(db);

  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  const api = express.Router();
  api.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  api.use('/notes', notesRouter(notes));
  api.use('/tags', tagsRouter(notes));
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

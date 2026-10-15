import path from 'node:path';
import { createApp } from './app.js';
import { openDatabase } from './database.js';

// Defaults resolve to the repository root, from both src/ (tsx) and dist/ (node).
const repoRoot = path.resolve(import.meta.dirname, '../..');
const port = Number(process.env.PORT ?? 3000);
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(repoRoot, 'data'));
const clientDist = path.resolve(process.env.CLIENT_DIST ?? path.join(repoRoot, 'client/dist'));

const dbFile = path.join(dataDir, 'scrumbanize.db');
const db = openDatabase(dbFile);
const app = createApp(db, { clientDist });

const server = app.listen(port, () => {
  console.log(`Scrumbanize listening on http://localhost:${port} (database: ${dbFile})`);
});

function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

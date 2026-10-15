import path from 'node:path';
import { startServer } from './start.js';

// Entry point for `npm run dev`, `npm start` and Docker; the desktop app calls startServer() itself.
// Defaults resolve to the repository root, from both src/ (tsx) and dist/ (node).
const repoRoot = path.resolve(import.meta.dirname, '../..');

const server = await startServer({
  port: Number(process.env.PORT ?? 3000),
  // All interfaces by default, so Docker's port mapping and other devices in the network can reach it.
  host: process.env.HOST || undefined,
  dataDir: process.env.DATA_DIR ?? path.join(repoRoot, 'data'),
  clientDist: path.resolve(process.env.CLIENT_DIST ?? path.join(repoRoot, 'client/dist')),
});

console.log(`Scrumbanize listening on ${server.url} (database: ${server.dbFile})`);

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received, shutting down`);
  await server.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

import path from 'node:path';
import { ConfigError, ensureTempDir, loadConfig, type ServerConfig } from './config.js';
import { startServer } from './start.js';

// Entry point for `npm run dev`, `npm start` and Docker; the desktop app calls startServer() itself.
// Defaults resolve to the repository root, from both src/ (tsx) and dist/ (node).
const repoRoot = path.resolve(import.meta.dirname, '../..');

// Settings from the environment (US-23, see config.ts and .env.example); a wrong value stops the start with a list
// of everything to fix.
let config: ServerConfig;
try {
  const loaded = loadConfig(process.env, repoRoot);
  config = loaded.config;
  for (const warning of loaded.warnings) console.warn(`Warning: ${warning}`);
  ensureTempDir(process.env);
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  console.error(error.message);
  process.exit(1);
}

let setupCode: string | undefined;
let listening = false;

const server = await startServer({
  port: config.port,
  // All interfaces by default, so Docker's port mapping and other devices in the network can reach it.
  host: config.host,
  dataDir: config.dataDir,
  clientDist: config.clientDist,
  // Login is on unless AUTH=off (US-21): this server is reachable from the network.
  auth: config.auth,
  allowedOrigins: config.allowedOrigins,
  trustProxy: config.trustProxy,
  version: config.version,
  backups: { time: config.backupTime, keep: config.backupKeep, timeZone: config.timeZone },
  onSetupCode: (code) => {
    setupCode = code;
    // Before the server address is known (at start) the message follows below; later it is printed right away.
    if (listening) printSetupCode();
  },
});
listening = true;

function printSetupCode(): void {
  console.log(`\nErsteinrichtung: ${config.baseUrl ?? server.url}/setup\nEinrichtungscode: ${setupCode}\n`);
}

console.log(
  `Scrumbanize ${config.version} listening on ${server.url} (database: ${server.dbFile}, login: ${config.auth === 'required' ? 'on' : 'off'}${
    config.baseUrl ? `, public address: ${config.baseUrl}` : ''
  })`,
);
if (setupCode) printSetupCode();

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received, shutting down`);
  await server.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

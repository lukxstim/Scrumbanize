import path from 'node:path';
import { startServer } from './start.js';

// Entry point for `npm run dev`, `npm start` and Docker; the desktop app calls startServer() itself.
// Defaults resolve to the repository root, from both src/ (tsx) and dist/ (node).
const repoRoot = path.resolve(import.meta.dirname, '../..');

// Login is on unless AUTH=off (US-21): this server is reachable from the network.
const auth = process.env.AUTH === 'off' ? 'local' : 'required';
const baseUrl = process.env.BASE_URL?.replace(/\/+$/, '');
const trustProxy = process.env.TRUST_PROXY;
let setupCode: string | undefined;
let listening = false;

const server = await startServer({
  port: Number(process.env.PORT ?? 3000),
  // All interfaces by default, so Docker's port mapping and other devices in the network can reach it.
  host: process.env.HOST || undefined,
  dataDir: process.env.DATA_DIR ?? path.join(repoRoot, 'data'),
  clientDist: path.resolve(process.env.CLIENT_DIST ?? path.join(repoRoot, 'client/dist')),
  auth,
  allowedOrigins: baseUrl ? [new URL(baseUrl).origin] : [],
  // "true", a number of proxies, or addresses as Express takes them.
  trustProxy: trustProxy === undefined ? undefined : trustProxy === 'true' ? true : /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy,
  onSetupCode: (code) => {
    setupCode = code;
    // Before the server address is known (at start) the message follows below; later it is printed right away.
    if (listening) printSetupCode();
  },
});
listening = true;

function printSetupCode(): void {
  console.log(`\nErsteinrichtung: ${baseUrl ?? server.url}/setup\nEinrichtungscode: ${setupCode}\n`);
}

console.log(`Scrumbanize listening on ${server.url} (database: ${server.dbFile}, login: ${auth === 'required' ? 'on' : 'off'})`);
if (setupCode) printSetupCode();

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received, shutting down`);
  await server.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

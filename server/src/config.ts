import fs from 'node:fs';
import path from 'node:path';
import type { AuthMode } from './auth/middleware.js';

/**
 * The server's settings from environment variables (US-23): `.env` with Docker Compose, the shell with `npm start`.
 * Everything is checked at start, and all problems are reported at once, so a typo in `.env` stops the server with a
 * clear message instead of surfacing later (an empty BACKUP_TIME at 3 a.m., a BASE_URL that refuses every change).
 * The desktop app does not read these; it passes its options to startServer() itself.
 */

/** A time of day, as BACKUP_TIME gives it. */
export interface TimeOfDay {
  hour: number;
  minute: number;
}

export interface ServerConfig {
  port: number;
  /** Undefined: all interfaces. */
  host: string | undefined;
  dataDir: string;
  clientDist: string;
  auth: AuthMode;
  /** The public address without a trailing slash: BASE_URL, else `https://` + DOMAIN. */
  baseUrl: string | undefined;
  /** Origins whose pages may send changes besides the server's own address: the base URL's and ALLOWED_ORIGINS. */
  allowedOrigins: string[];
  /** As Express' "trust proxy" takes it. */
  trustProxy: boolean | number | string | undefined;
  /** Host name Caddy gets a certificate for; read by the server only to check it and to derive the base URL. */
  domain: string | undefined;
  /** Contact for Let's Encrypt (Caddy); checked here so a typo shows up in the server's start, too. */
  acmeEmail: string | undefined;
  /** When the daily backup runs (US-23b); null: BACKUP_TIME=off. */
  backupTime: TimeOfDay | null;
  /** How many daily backups are kept. */
  backupKeep: number;
  /** IANA time zone of BACKUP_TIME (TZ, else the system's). */
  timeZone: string;
  /** The app's version: APP_VERSION, else desktop/package.json, which release tags must match. */
  version: string;
  /** NODE_ENV=production (the Docker image). */
  production: boolean;
}

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

export const DEFAULT_BACKUP_TIME: TimeOfDay = { hour: 3, minute: 0 };
export const DEFAULT_BACKUP_KEEP = 14;
const MAX_BACKUP_KEEP = 365;

// Labels of letters, digits and hyphens (not at either end), separated by dots.
const HOST_NAME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME_OF_DAY = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** A web address that is only an origin (scheme, host, port), as the browser sends it in `Origin`; else undefined. */
function originOf(value: string): string | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  const onlyOrigin = (url.pathname === '/' || url.pathname === '') && !url.search && !url.hash && !url.username;
  return (url.protocol === 'https:' || url.protocol === 'http:') && onlyOrigin ? url.origin : undefined;
}

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The version in desktop/package.json, the one release tags are checked against; undefined if it cannot be read. */
function packageVersion(repoRoot: string): string | undefined {
  try {
    const { version } = JSON.parse(fs.readFileSync(path.join(repoRoot, 'desktop/package.json'), 'utf8')) as { version?: unknown };
    return typeof version === 'string' ? version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Creates the folder for temporary files if TMPDIR names one. The Docker image points it into the data volume (its own
 * file system is read-only there), and volumes from before that version do not have the folder yet.
 */
export function ensureTempDir(env: Record<string, string | undefined>): void {
  const dir = env.TMPDIR?.trim();
  if (dir) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Reads and checks the settings. Empty values count as unset (Compose passes `VAR=` for variables left empty in
 * `.env`). Throws a ConfigError listing every problem; `warnings` are settings that work but are probably not meant.
 */
export function loadConfig(env: Record<string, string | undefined>, repoRoot: string): { config: ServerConfig; warnings: string[] } {
  const problems: string[] = [];
  const warnings: string[] = [];
  const value = (name: string) => {
    const v = env[name]?.trim();
    return v ? v : undefined;
  };

  const portText = value('PORT');
  const port = portText === undefined ? 3000 : Number(portText);
  if (!/^\d+$/.test(portText ?? '3000') || port < 1 || port > 65535) problems.push(`PORT must be a number from 1 to 65535, not "${portText}"`);

  const authText = value('AUTH')?.toLowerCase();
  if (authText !== undefined && authText !== 'on' && authText !== 'off') problems.push(`AUTH must be "on" or "off", not "${value('AUTH')}"`);
  const auth: AuthMode = authText === 'off' ? 'local' : 'required';

  const domain = value('DOMAIN')?.toLowerCase();
  if (domain !== undefined && !HOST_NAME.test(domain)) {
    problems.push(`DOMAIN must be a host name like scrumbanize.example.org (without https:// or a path), not "${value('DOMAIN')}"`);
  }

  const acmeEmail = value('ACME_EMAIL');
  if (acmeEmail !== undefined && !EMAIL.test(acmeEmail)) problems.push(`ACME_EMAIL must be an email address, not "${acmeEmail}"`);

  const baseUrlText = value('BASE_URL');
  let baseUrl: string | undefined;
  if (baseUrlText !== undefined) {
    baseUrl = originOf(baseUrlText);
    if (baseUrl === undefined) {
      problems.push(`BASE_URL must be an address like https://scrumbanize.example.org (without a path), not "${baseUrlText}"`);
    } else if (domain !== undefined && HOST_NAME.test(domain) && new URL(baseUrl).hostname !== domain) {
      problems.push(`BASE_URL (${baseUrl}) and DOMAIN (${domain}) name different hosts; set only DOMAIN, or both to the same host`);
    }
  } else if (domain !== undefined && HOST_NAME.test(domain)) {
    baseUrl = `https://${domain}`;
  }

  const allowedOrigins = baseUrl ? [baseUrl] : [];
  for (const entry of (value('ALLOWED_ORIGINS') ?? '').split(',').map((e) => e.trim()).filter(Boolean)) {
    const origin = originOf(entry);
    if (origin === undefined) problems.push(`ALLOWED_ORIGINS: "${entry}" is not an address like https://other.example.org`);
    else if (!allowedOrigins.includes(origin)) allowedOrigins.push(origin);
  }

  const trustProxyText = value('TRUST_PROXY');
  const trustProxy =
    trustProxyText === undefined
      ? undefined
      : trustProxyText === 'true'
        ? true
        : trustProxyText === 'false'
          ? false
          : /^\d+$/.test(trustProxyText)
            ? Number(trustProxyText)
            : trustProxyText;

  const backupTimeText = value('BACKUP_TIME');
  let backupTime: TimeOfDay | null = DEFAULT_BACKUP_TIME;
  if (backupTimeText?.toLowerCase() === 'off') {
    backupTime = null;
  } else if (backupTimeText !== undefined) {
    const match = TIME_OF_DAY.exec(backupTimeText);
    if (match) backupTime = { hour: Number(match[1]), minute: Number(match[2]) };
    else problems.push(`BACKUP_TIME must be a time like 03:00 (24 hours) or "off", not "${backupTimeText}"`);
  }

  const backupKeepText = value('BACKUP_KEEP');
  const backupKeep = backupKeepText === undefined ? DEFAULT_BACKUP_KEEP : Number(backupKeepText);
  if (backupKeepText !== undefined && (!/^\d+$/.test(backupKeepText) || backupKeep < 1 || backupKeep > MAX_BACKUP_KEEP)) {
    problems.push(`BACKUP_KEEP must be a number from 1 to ${MAX_BACKUP_KEEP}, not "${backupKeepText}"`);
  }

  // Node applies TZ itself and quietly falls back to UTC for unknown names, which would move the backup's time.
  const tz = value('TZ');
  if (tz !== undefined && !isTimeZone(tz)) problems.push(`TZ must be a time zone like Europe/Berlin, not "${tz}"`);
  const timeZone = tz !== undefined && isTimeZone(tz) ? tz : Intl.DateTimeFormat().resolvedOptions().timeZone;

  if (problems.length > 0) throw new ConfigError(problems);

  const production = value('NODE_ENV') === 'production';
  if (baseUrl?.startsWith('http:') && production && !LOCAL_HOSTS.has(new URL(baseUrl).host.replace(/:\d+$/, ''))) {
    warnings.push(`BASE_URL uses http: passwords and session cookies travel unencrypted. Use https (Caddy in docker-compose.yml).`);
  }
  if (baseUrl?.startsWith('https:') && trustProxy === undefined) {
    warnings.push(
      'BASE_URL uses https, but TRUST_PROXY is not set: behind a reverse proxy the server does not see the HTTPS, so session cookies lose "Secure". Set TRUST_PROXY=1.',
    );
  }
  if (auth === 'local' && production) warnings.push('AUTH=off: everyone who reaches this server can use it without logging in.');

  return {
    config: {
      port,
      host: value('HOST'),
      dataDir: path.resolve(value('DATA_DIR') ?? path.join(repoRoot, 'data')),
      clientDist: path.resolve(value('CLIENT_DIST') ?? path.join(repoRoot, 'client/dist')),
      auth,
      baseUrl,
      allowedOrigins,
      trustProxy,
      domain,
      acmeEmail,
      backupTime,
      backupKeep,
      timeZone,
      version: value('APP_VERSION') ?? packageVersion(repoRoot) ?? 'unknown',
      production,
    },
    warnings,
  };
}

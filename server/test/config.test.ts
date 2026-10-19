import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConfigError, DEFAULT_BACKUP_KEEP, loadConfig } from '../src/config.js';

let repoRoot: string;
beforeAll(() => {
  repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumbanize-config-'));
  fs.mkdirSync(path.join(repoRoot, 'desktop'));
  fs.writeFileSync(path.join(repoRoot, 'desktop/package.json'), JSON.stringify({ version: '1.2.3' }));
});
afterAll(() => fs.rmSync(repoRoot, { recursive: true, force: true }));

const load = (env: Record<string, string | undefined>) => loadConfig(env, repoRoot);
/** The problems a ConfigError lists, or [] if the settings are fine. */
function problemsOf(env: Record<string, string | undefined>): string[] {
  try {
    load(env);
    return [];
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
}

describe('loadConfig', () => {
  it('has defaults for an empty environment', () => {
    const { config, warnings } = load({});
    expect(config).toMatchObject({
      port: 3000,
      host: undefined,
      dataDir: path.join(repoRoot, 'data'),
      clientDist: path.join(repoRoot, 'client/dist'),
      auth: 'required',
      baseUrl: undefined,
      allowedOrigins: [],
      trustProxy: undefined,
      backupTime: { hour: 3, minute: 0 },
      backupKeep: DEFAULT_BACKUP_KEEP,
      version: '1.2.3',
      production: false,
    });
    expect(warnings).toEqual([]);
  });

  it('treats empty values as unset, as Compose passes them', () => {
    expect(load({ PORT: '', BASE_URL: ' ', BACKUP_TIME: '' }).config).toMatchObject({ port: 3000, baseUrl: undefined, backupTime: { hour: 3, minute: 0 } });
  });

  it('reads the Docker setup of a public server', () => {
    const { config, warnings } = load({
      NODE_ENV: 'production',
      PORT: '3000',
      DATA_DIR: '/data',
      DOMAIN: 'Scrumbanize.Example.org',
      ACME_EMAIL: 'admin@example.org',
      TRUST_PROXY: '1',
      ALLOWED_ORIGINS: 'https://other.example.org, https://other.example.org/',
      BACKUP_TIME: '4:30',
      BACKUP_KEEP: '30',
      TZ: 'Europe/Berlin',
      APP_VERSION: '2.0.0',
    });
    expect(config).toMatchObject({
      dataDir: path.resolve('/data'),
      domain: 'scrumbanize.example.org',
      baseUrl: 'https://scrumbanize.example.org',
      allowedOrigins: ['https://scrumbanize.example.org', 'https://other.example.org'],
      trustProxy: 1,
      backupTime: { hour: 4, minute: 30 },
      backupKeep: 30,
      timeZone: 'Europe/Berlin',
      version: '2.0.0',
      production: true,
    });
    expect(warnings).toEqual([]);
  });

  it('takes BASE_URL as an origin, also matching DOMAIN', () => {
    expect(load({ BASE_URL: 'https://notes.example.org/' }).config.baseUrl).toBe('https://notes.example.org');
    expect(load({ BASE_URL: 'http://localhost:8080' }).config.allowedOrigins).toEqual(['http://localhost:8080']);
    expect(load({ BASE_URL: 'https://notes.example.org', DOMAIN: 'notes.example.org', TRUST_PROXY: '1' }).config.baseUrl).toBe('https://notes.example.org');
  });

  it('parses TRUST_PROXY like Express', () => {
    expect(load({ TRUST_PROXY: 'true' }).config.trustProxy).toBe(true);
    expect(load({ TRUST_PROXY: 'false' }).config.trustProxy).toBe(false);
    expect(load({ TRUST_PROXY: '2' }).config.trustProxy).toBe(2);
    expect(load({ TRUST_PROXY: 'loopback, 10.0.0.0/8' }).config.trustProxy).toBe('loopback, 10.0.0.0/8');
  });

  it('switches login and daily backups off on request', () => {
    expect(load({ AUTH: 'off' }).config.auth).toBe('local');
    expect(load({ AUTH: 'ON' }).config.auth).toBe('required');
    expect(load({ BACKUP_TIME: 'off' }).config.backupTime).toBeNull();
  });

  it('reports every wrong value at once', () => {
    const problems = problemsOf({
      PORT: '80a',
      AUTH: 'nein',
      DOMAIN: 'https://scrumbanize.example.org',
      ACME_EMAIL: 'admin',
      BASE_URL: 'scrumbanize.example.org',
      ALLOWED_ORIGINS: 'https://ok.example.org,ftp://x.example.org',
      BACKUP_TIME: '25:00',
      BACKUP_KEEP: '0',
      TZ: 'Mars/Olympus',
    });
    expect(problems.map((p) => p.split(' ')[0])).toEqual(['PORT', 'AUTH', 'DOMAIN', 'ACME_EMAIL', 'BASE_URL', 'ALLOWED_ORIGINS:', 'BACKUP_TIME', 'BACKUP_KEEP', 'TZ']);
    expect(() => load({ PORT: '0' })).toThrow(/PORT must be a number from 1 to 65535/);
  });

  it('refuses addresses with a path, and BASE_URL naming another host than DOMAIN', () => {
    expect(problemsOf({ BASE_URL: 'https://example.org/scrumbanize' })).toHaveLength(1);
    expect(problemsOf({ ALLOWED_ORIGINS: 'https://example.org/app' })).toHaveLength(1);
    expect(problemsOf({ BASE_URL: 'https://a.example.org', DOMAIN: 'b.example.org' })[0]).toMatch(/different hosts/);
    expect(problemsOf({ BACKUP_KEEP: '366' })).toHaveLength(1);
    expect(problemsOf({ BACKUP_TIME: '3 Uhr' })).toHaveLength(1);
  });

  it('warns about settings that work but are probably not meant', () => {
    expect(load({ NODE_ENV: 'production', BASE_URL: 'http://scrumbanize.example.org' }).warnings[0]).toMatch(/unencrypted/);
    // http on the own machine is fine, e.g. docker-compose.local.yml.
    expect(load({ NODE_ENV: 'production', BASE_URL: 'http://localhost:3000' }).warnings).toEqual([]);
    expect(load({ DOMAIN: 'scrumbanize.example.org' }).warnings[0]).toMatch(/TRUST_PROXY/);
    expect(load({ NODE_ENV: 'production', AUTH: 'off' }).warnings[0]).toMatch(/without logging in/);
  });

  it('accepts .env.example as it is, with what docker-compose.yml adds', () => {
    const file = fs.readFileSync(path.resolve(import.meta.dirname, '../../.env.example'), 'utf8');
    const env = Object.fromEntries(
      file
        .split(/\r?\n/)
        .filter((line) => /^[A-Z_]+=/.test(line))
        .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
    );
    expect(Object.keys(env)).toEqual(expect.arrayContaining(['DOMAIN', 'ACME_EMAIL', 'BACKUP_TIME', 'BACKUP_KEEP', 'TZ']));
    const { config, warnings } = load({ ...env, NODE_ENV: 'production', DATA_DIR: '/data', TRUST_PROXY: '1' });
    expect(config).toMatchObject({ baseUrl: 'https://scrumbanize.example.org', backupKeep: 14, timeZone: 'Europe/Berlin' });
    expect(warnings).toEqual([]);
  });

  it('falls back to "unknown" when no version can be found', () => {
    expect(loadConfig({}, path.join(repoRoot, 'missing')).config.version).toBe('unknown');
  });
});

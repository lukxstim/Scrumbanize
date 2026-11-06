import { describe, expect, it } from 'vitest';
import { checkServer, normalizeServerUrl } from '../src/serverLink.js';

describe('normalizeServerUrl (US-31)', () => {
  it('keeps only the origin and adds https', () => {
    expect(normalizeServerUrl(' scrumbanize.onrender.com/p/2/board ')).toEqual({ ok: true, url: 'https://scrumbanize.onrender.com' });
    expect(normalizeServerUrl('https://Scrumbanize.example:8443/')).toEqual({ ok: true, url: 'https://scrumbanize.example:8443' });
  });

  it('allows plain http only at home', () => {
    expect(normalizeServerUrl('http://192.168.1.20:3000')).toEqual({ ok: true, url: 'http://192.168.1.20:3000' });
    expect(normalizeServerUrl('http://localhost:3000')).toEqual({ ok: true, url: 'http://localhost:3000' });
    expect(normalizeServerUrl('http://nas.local')).toEqual({ ok: true, url: 'http://nas.local' });
    expect(normalizeServerUrl('http://scrumbanize.onrender.com')).toEqual({ ok: false, error: 'insecure' });
  });

  it('refuses what is not a web address', () => {
    expect(normalizeServerUrl('')).toEqual({ ok: false, error: 'invalid_url' });
    expect(normalizeServerUrl('ftp://example.org')).toEqual({ ok: false, error: 'invalid_url' });
    expect(normalizeServerUrl('https://user:pw@example.org')).toEqual({ ok: false, error: 'invalid_url' });
    expect(normalizeServerUrl('https://')).toEqual({ ok: false, error: 'invalid_url' });
  });
});

const answer = (status: number, body: unknown) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => {
    if (body === undefined) throw new SyntaxError('not JSON');
    return body;
  },
});

describe('checkServer', () => {
  it('accepts a working Scrumbanize and reports its version', async () => {
    expect(await checkServer('https://x', answer(200, { status: 'ok', version: '1.1.0', database: 'ok', backups: 'ok' }))).toEqual({ ok: true, version: '1.1.0' });
  });

  it('tells other servers, broken ones and no answer apart', async () => {
    expect(await checkServer('https://x', answer(200, undefined))).toEqual({ ok: false, error: 'not_scrumbanize' });
    expect(await checkServer('https://x', answer(200, { hello: 'world' }))).toEqual({ ok: false, error: 'not_scrumbanize' });
    expect(await checkServer('https://x', answer(503, { status: 'error', database: 'error' }))).toEqual({ ok: false, error: 'unhealthy' });
    expect(await checkServer('https://x', async () => Promise.reject(new TypeError('fetch failed')))).toEqual({ ok: false, error: 'unreachable' });
  });

  it('gives up after the timeout', async () => {
    const never = (_url: string, init?: { signal?: AbortSignal }) =>
      new Promise<never>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    expect(await checkServer('https://x', never, 20)).toEqual({ ok: false, error: 'unreachable' });
  });
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { openDatabase, type Db } from '../src/database.js';
import { healthReport } from '../src/health.js';

let dir: string;
let db: Db;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumbanize-health-'));
  db = openDatabase(':memory:');
});
afterEach(() => {
  if (db.open) db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('GET /api/health', () => {
  it('reports database, version and backup folder, without login', async () => {
    const app = createApp(db, { auth: 'required', uploadsDir: path.join(dir, 'uploads'), version: '1.2.3' });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', version: '1.2.3', database: 'ok', backups: 'ok' });
    // The backup folder is created next to the uploads.
    expect(fs.existsSync(path.join(dir, 'backups'))).toBe(true);
  });

  it('has no version where none was given', async () => {
    expect((await request(createApp(db, { uploadsDir: path.join(dir, 'uploads') })).get('/api/health')).body.version).toBeNull();
  });
});

describe('healthReport', () => {
  it('is degraded, not failing, when backups cannot be written', () => {
    // A file where the folder should be: it can neither be created nor written into.
    const blocked = path.join(dir, 'backups');
    fs.writeFileSync(blocked, '');
    expect(healthReport(db, blocked, '1.0.0')).toEqual({ status: 'degraded', version: '1.0.0', database: 'ok', backups: 'not_writable' });
  });

  it('fails when the database does not answer', async () => {
    const app = createApp(db, { uploadsDir: path.join(dir, 'uploads') });
    db.close();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'error', database: 'error' });
  });
});

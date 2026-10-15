import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type Db = Database.Database;

// Each entry upgrades the schema by one version; the resulting version is stored in PRAGMA user_version.
// Append new migrations, never edit existing ones.
export const migrations: string[] = [
  `
  CREATE TABLE notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE
  );

  CREATE TABLE note_tags (
    note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
  );

  CREATE INDEX idx_note_tags_tag_id ON note_tags(tag_id);
  CREATE INDEX idx_notes_updated_at ON notes(updated_at);
  `,
  `
  CREATE TABLE tasks (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    title          TEXT NOT NULL,
    description    TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'backlog'
                   CHECK (status IN ('backlog', 'todo', 'in_progress', 'review', 'done')),
    position       REAL NOT NULL,
    source_note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  );

  CREATE INDEX idx_tasks_source_note_id ON tasks(source_note_id);
  CREATE INDEX idx_tasks_status_position ON tasks(status, position);
  `,
  `
  CREATE TABLE board_columns (
    status    TEXT PRIMARY KEY CHECK (status IN ('backlog', 'todo', 'in_progress', 'review', 'done')),
    wip_limit INTEGER CHECK (wip_limit IS NULL OR wip_limit > 0)
  );

  INSERT INTO board_columns (status, wip_limit) VALUES
    ('backlog', NULL), ('todo', NULL), ('in_progress', 3), ('review', NULL), ('done', NULL);
  `,
  // Projects: notes, tasks and board settings now belong to a project. Existing data moves to "Allgemein".
  // SQLite cannot add a NOT NULL foreign key column, so the tables are rebuilt.
  `
  CREATE TABLE projects (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    color      TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  INSERT INTO projects (id, name, color, created_at, updated_at)
  VALUES (1, 'Allgemein', 'slate', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

  CREATE TABLE notes_new (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  INSERT INTO notes_new (id, project_id, title, content, created_at, updated_at)
    SELECT id, 1, title, content, created_at, updated_at FROM notes;
  DROP TABLE notes;
  ALTER TABLE notes_new RENAME TO notes;
  CREATE INDEX idx_notes_project_updated_at ON notes(project_id, updated_at);

  CREATE TABLE tasks_new (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title          TEXT NOT NULL,
    description    TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'backlog'
                   CHECK (status IN ('backlog', 'todo', 'in_progress', 'review', 'done')),
    position       REAL NOT NULL,
    source_note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  );
  INSERT INTO tasks_new (id, project_id, title, description, status, position, source_note_id, created_at, updated_at)
    SELECT id, 1, title, description, status, position, source_note_id, created_at, updated_at FROM tasks;
  DROP TABLE tasks;
  ALTER TABLE tasks_new RENAME TO tasks;
  CREATE INDEX idx_tasks_source_note_id ON tasks(source_note_id);
  CREATE INDEX idx_tasks_project_status_position ON tasks(project_id, status, position);

  CREATE TABLE board_columns_new (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    status     TEXT NOT NULL CHECK (status IN ('backlog', 'todo', 'in_progress', 'review', 'done')),
    wip_limit  INTEGER CHECK (wip_limit IS NULL OR wip_limit > 0),
    PRIMARY KEY (project_id, status)
  );
  INSERT INTO board_columns_new (project_id, status, wip_limit) SELECT 1, status, wip_limit FROM board_columns;
  DROP TABLE board_columns;
  ALTER TABLE board_columns_new RENAME TO board_columns;
  `,
];

/** Opens (or creates) the database at `file` and brings its schema up to date. Pass ':memory:' for tests. */
export function openDatabase(file: string): Db {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }

  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  migrate(db);
  db.pragma('foreign_keys = ON');
  return db;
}

/**
 * Foreign keys stay off while migrating, so tables can be rebuilt (SQLite only allows switching them
 * outside a transaction). Each migration is checked with foreign_key_check before it is committed.
 */
function migrate(db: Db): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  db.pragma('foreign_keys = OFF');

  for (let version = current; version < migrations.length; version++) {
    db.transaction(() => {
      db.exec(migrations[version]!);
      const violations = db.pragma('foreign_key_check') as unknown[];
      if (violations.length > 0) {
        throw new Error(`Migration ${version + 1} left ${violations.length} broken foreign key references`);
      }
      db.pragma(`user_version = ${version + 1}`);
    })();
  }
}

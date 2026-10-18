import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type Db = Database.Database;

/** The database file and the folder of attachment files, both in the data directory. */
export const DB_FILE_NAME = 'scrumbanize.db';
export const UPLOADS_DIR_NAME = 'uploads';

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
  // Custom columns and swimlanes: the five fixed statuses become real columns per project, every project
  // gets the swimlane "Standard", and tasks point at a column and a lane instead of a status.
  `
  CREATE TABLE lanes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    position   REAL NOT NULL
  );
  INSERT INTO lanes (project_id, name, position) SELECT id, 'Standard', 1 FROM projects ORDER BY id;
  CREATE INDEX idx_lanes_project_position ON lanes(project_id, position);

  CREATE TABLE board_columns_new (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    position   REAL NOT NULL,
    wip_limit  INTEGER CHECK (wip_limit IS NULL OR wip_limit > 0)
  );
  -- The old status order becomes the column position (1-5), which also maps tasks to their new column below.
  INSERT INTO board_columns_new (project_id, name, position, wip_limit)
    SELECT project_id,
      CASE status WHEN 'backlog' THEN 'Backlog' WHEN 'todo' THEN 'To Do' WHEN 'in_progress' THEN 'In Progress'
                  WHEN 'review' THEN 'Review' ELSE 'Done' END,
      CASE status WHEN 'backlog' THEN 1 WHEN 'todo' THEN 2 WHEN 'in_progress' THEN 3 WHEN 'review' THEN 4 ELSE 5 END,
      wip_limit
    FROM board_columns ORDER BY project_id, 3;
  DROP TABLE board_columns;
  ALTER TABLE board_columns_new RENAME TO board_columns;
  CREATE INDEX idx_board_columns_project_position ON board_columns(project_id, position);

  CREATE TABLE tasks_new (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    column_id      INTEGER NOT NULL REFERENCES board_columns(id),
    lane_id        INTEGER NOT NULL REFERENCES lanes(id),
    title          TEXT NOT NULL,
    description    TEXT NOT NULL DEFAULT '',
    position       REAL NOT NULL,
    source_note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  );
  INSERT INTO tasks_new (id, project_id, column_id, lane_id, title, description, position, source_note_id, created_at, updated_at)
    SELECT t.id, t.project_id,
      (SELECT c.id FROM board_columns c WHERE c.project_id = t.project_id AND c.position =
        CASE t.status WHEN 'backlog' THEN 1 WHEN 'todo' THEN 2 WHEN 'in_progress' THEN 3 WHEN 'review' THEN 4 ELSE 5 END),
      (SELECT l.id FROM lanes l WHERE l.project_id = t.project_id),
      t.title, t.description, t.position, t.source_note_id, t.created_at, t.updated_at
    FROM tasks t;
  DROP TABLE tasks;
  ALTER TABLE tasks_new RENAME TO tasks;
  CREATE INDEX idx_tasks_source_note_id ON tasks(source_note_id);
  CREATE INDEX idx_tasks_project ON tasks(project_id);
  CREATE INDEX idx_tasks_cell ON tasks(column_id, lane_id, position);
  `,
  // Activity log per project. The log starts empty; existing notes and tasks get no entries.
  `
  CREATE TABLE activities (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('note', 'task', 'board', 'project')),
    entity_id   INTEGER,
    action_type TEXT NOT NULL CHECK (action_type IN ('create', 'update', 'move', 'delete')),
    description TEXT NOT NULL,
    metadata    TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata)),
    created_at  TEXT NOT NULL
  );
  CREATE INDEX idx_activities_project ON activities(project_id, id);
  CREATE INDEX idx_activities_project_type ON activities(project_id, entity_type, id);
  CREATE INDEX idx_activities_entity ON activities(entity_type, entity_id, id);
  `,
  // Task priority and dates. Dates are calendar dates (YYYY-MM-DD) without time or time zone; "start ≤ due"
  // and "start needs due" are checked by the server, since ADD COLUMN cannot add table constraints.
  `
  ALTER TABLE tasks ADD COLUMN priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent'));
  -- date() returns NULL for invalid dates, so IS (not =) makes the check fail instead of passing as unknown.
  ALTER TABLE tasks ADD COLUMN start_date TEXT CHECK (start_date IS NULL OR start_date IS date(start_date));
  ALTER TABLE tasks ADD COLUMN due_date TEXT CHECK (due_date IS NULL OR due_date IS date(due_date));
  CREATE INDEX idx_tasks_project_due ON tasks(project_id, due_date);
  `,
  // Trash bin: notes, tasks and projects are soft-deleted via deleted_at. Project names only have to be unique
  // among projects outside the trash, so the table is rebuilt with a partial unique index instead of UNIQUE.
  // The activity log gets the actions "restore" and "purge". The live_* views hold what the app shows:
  // rows outside the trash, and notes and tasks only while their project is outside the trash, too.
  `
  ALTER TABLE notes ADD COLUMN deleted_at TEXT;
  ALTER TABLE tasks ADD COLUMN deleted_at TEXT;
  CREATE INDEX idx_notes_trash ON notes(deleted_at) WHERE deleted_at IS NOT NULL;
  CREATE INDEX idx_tasks_trash ON tasks(deleted_at) WHERE deleted_at IS NOT NULL;

  CREATE TABLE projects_new (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL COLLATE NOCASE,
    color      TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  INSERT INTO projects_new (id, name, color, created_at, updated_at)
    SELECT id, name, color, created_at, updated_at FROM projects;
  DROP TABLE projects;
  ALTER TABLE projects_new RENAME TO projects;
  CREATE UNIQUE INDEX idx_projects_live_name ON projects(name) WHERE deleted_at IS NULL;

  CREATE TABLE activities_new (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('note', 'task', 'board', 'project')),
    entity_id   INTEGER,
    action_type TEXT NOT NULL CHECK (action_type IN ('create', 'update', 'move', 'delete', 'restore', 'purge')),
    description TEXT NOT NULL,
    metadata    TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata)),
    created_at  TEXT NOT NULL
  );
  INSERT INTO activities_new SELECT id, project_id, entity_type, entity_id, action_type, description, metadata, created_at
    FROM activities;
  DROP TABLE activities;
  ALTER TABLE activities_new RENAME TO activities;
  CREATE INDEX idx_activities_project ON activities(project_id, id);
  CREATE INDEX idx_activities_project_type ON activities(project_id, entity_type, id);
  CREATE INDEX idx_activities_entity ON activities(entity_type, entity_id, id);

  CREATE VIEW live_projects AS SELECT * FROM projects WHERE deleted_at IS NULL;
  CREATE VIEW live_notes AS
    SELECT n.* FROM notes n JOIN projects p ON p.id = n.project_id WHERE n.deleted_at IS NULL AND p.deleted_at IS NULL;
  CREATE VIEW live_tasks AS
    SELECT t.* FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.deleted_at IS NULL AND p.deleted_at IS NULL;
  `,
  // Links between tasks of a project. "blocks" points from the blocking to the blocked task; "relates" has no
  // direction. A pair of tasks has at most one link, whichever way round it was set. Links of a trashed task
  // stay (hidden through live_tasks) and go when it is purged.
  `
  CREATE TABLE task_links (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    source_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    target_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    type           TEXT NOT NULL CHECK (type IN ('relates', 'blocks')),
    created_at     TEXT NOT NULL,
    CHECK (source_task_id <> target_task_id)
  );
  CREATE UNIQUE INDEX idx_task_links_pair
    ON task_links(min(source_task_id, target_task_id), max(source_task_id, target_task_id));
  CREATE INDEX idx_task_links_target ON task_links(target_task_id);
  `,
  // File attachments of notes and tasks. The files live in <dataDir>/uploads under stored_name; rows go with
  // their note, task or project (cascade), and files without a row are swept away (see attachmentsRepository).
  `
  CREATE TABLE attachments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    note_id     INTEGER REFERENCES notes(id) ON DELETE CASCADE,
    task_id     INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    file_name   TEXT NOT NULL,
    stored_name TEXT NOT NULL UNIQUE,
    mime_type   TEXT NOT NULL,
    size        INTEGER NOT NULL,
    created_at  TEXT NOT NULL,
    CHECK ((note_id IS NULL) <> (task_id IS NULL))
  );
  CREATE INDEX idx_attachments_note ON attachments(note_id);
  CREATE INDEX idx_attachments_task ON attachments(task_id);
  `,
  // Facts about the installation, e.g. which project is the sample project created on the first start.
  `
  CREATE TABLE app_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  // Colored task labels per project, and templates for new notes and tasks: per project, or for all projects
  // (project_id NULL). Template defaults name labels, column and lane instead of pointing at them, so a template for
  // all projects works wherever such a label or column exists. Three templates for all projects to start with.
  `
  CREATE TABLE labels (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL,
    position   REAL NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX idx_labels_project_name ON labels(project_id, name COLLATE NOCASE);

  CREATE TABLE task_labels (
    task_id  INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, label_id)
  );
  CREATE INDEX idx_task_labels_label ON task_labels(label_id);

  CREATE TABLE templates (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL CHECK (kind IN ('note', 'task')),
    name       TEXT NOT NULL,
    title      TEXT NOT NULL DEFAULT '',
    content    TEXT NOT NULL DEFAULT '',
    defaults   TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(defaults)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX idx_templates_scope_kind_name ON templates(ifnull(project_id, 0), kind, name COLLATE NOCASE);

  INSERT INTO templates (project_id, kind, name, title, content, defaults, created_at, updated_at) VALUES
    (NULL, 'note', 'Meeting-Protokoll', 'Meeting {{datum}}',
     '**Datum:** {{wochentag}}, {{datum}}, {{uhrzeit}} Uhr' || char(10) || '**Teilnehmende:** ' || char(10) || char(10) ||
     '## Agenda' || char(10) || char(10) || '- ' || char(10) || char(10) ||
     '## Notizen' || char(10) || char(10) ||
     '## Entscheidungen' || char(10) || char(10) || '- ' || char(10) || char(10) ||
     '## Aufgaben' || char(10) || char(10) || '- [ ] ',
     '{"tags":["meeting"]}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    (NULL, 'note', 'Sprint-Planning', 'Sprint-Planning KW {{kw}}',
     '## Sprint-Ziel' || char(10) || char(10) ||
     '## Kapazität' || char(10) || char(10) || '- ' || char(10) || char(10) ||
     '## Ausgewählte Aufgaben' || char(10) || char(10) || '- [ ] ' || char(10) || char(10) ||
     '## Risiken' || char(10) || char(10) || '- ',
     '{"tags":["sprint"]}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    (NULL, 'task', 'Bug-Report', 'Bug: ',
     '## Beschreibung' || char(10) || char(10) ||
     '## Schritte zum Nachstellen' || char(10) || char(10) || '1. ' || char(10) || char(10) ||
     '## Erwartet' || char(10) || char(10) ||
     '## Tatsächlich' || char(10) || char(10) ||
     '## Umgebung' || char(10),
     '{"priority":"high","labels":["Bug"],"column":null,"lane":null,"dueInDays":null}',
     strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
  `,
  // Board column widths in pixels (US-19), the same on every device; NULL is the default width of the client.
  `
  ALTER TABLE board_columns ADD COLUMN width INTEGER CHECK (width IS NULL OR width BETWEEN 200 AND 600);
  `,
];

export interface OpenOptions {
  /** Runs once, right after a brand-new database was set up (e.g. to create the sample project). */
  onCreate?: (db: Db) => void;
}

/** Opens (or creates) the database at `file` and brings its schema up to date. Pass ':memory:' for tests. */
export function openDatabase(file: string, options: OpenOptions = {}): Db {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }

  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  const previousVersion = migrate(db);
  db.pragma('foreign_keys = ON');
  // Version 0 before migrating means the file was just created: a first start, not an update.
  if (previousVersion === 0) options.onCreate?.(db);
  return db;
}

/**
 * Foreign keys stay off while migrating, so tables can be rebuilt (SQLite only allows switching them
 * outside a transaction). Each migration is checked with foreign_key_check before it is committed.
 * Returns the schema version the database had before.
 */
function migrate(db: Db): number {
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
  return current;
}

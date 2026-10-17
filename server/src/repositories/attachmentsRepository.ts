import fs from 'node:fs';
import path from 'node:path';
import { text } from '../activityText.js';
import type { Db } from '../database.js';
import { createActivityRepository } from './activityRepository.js';

export interface Attachment {
  id: number;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export type AttachmentOwner = { type: 'note' | 'task'; id: number };

interface AttachmentRow {
  id: number;
  project_id: number;
  note_id: number | null;
  task_id: number | null;
  file_name: string;
  stored_name: string;
  mime_type: string;
  size: number;
  created_at: string;
}

/** A file multer has written into the incoming folder (see INCOMING_DIR). */
export interface StoredUpload {
  fileName: string;
  storedName: string;
  mimeType: string;
  size: number;
}

/**
 * Uploads are written into this subfolder first and only moved into the uploads folder once their row exists.
 * So every file directly in the uploads folder without a row can be deleted right away.
 */
export const INCOMING_DIR = '.incoming';

/** Incoming files younger than this are left alone when sweeping, since their upload may still be running. */
const INCOMING_MAX_AGE_MS = 60 * 60 * 1000;

const toAttachment = (row: AttachmentRow): Attachment => ({
  id: row.id,
  fileName: row.file_name,
  mimeType: row.mime_type,
  size: row.size,
  createdAt: row.created_at,
});

/** Read-only lookups that the notes and tasks repositories use to include attachments. */
export function createAttachmentQueries(db: Db) {
  const ofNote = db.prepare<[number], AttachmentRow>(`SELECT * FROM attachments WHERE note_id = ? ORDER BY id`);
  const ofTask = db.prepare<[number], AttachmentRow>(`SELECT * FROM attachments WHERE task_id = ? ORDER BY id`);
  const ofProjectNotes = db.prepare<[number], AttachmentRow>(
    `SELECT * FROM attachments WHERE project_id = ? AND note_id IS NOT NULL ORDER BY id`,
  );
  return {
    forNote: (noteId: number) => ofNote.all(noteId).map(toAttachment),
    forTask: (taskId: number) => ofTask.all(taskId).map(toAttachment),
    /** All note attachments of a project, by note id (for note lists). */
    forProjectNotes(projectId: number): Map<number, Attachment[]> {
      const byNote = new Map<number, Attachment[]>();
      for (const row of ofProjectNotes.all(projectId)) {
        const list = byNote.get(row.note_id!) ?? [];
        list.push(toAttachment(row));
        byNote.set(row.note_id!, list);
      }
      return byNote;
    },
  };
}

export type AttachmentsRepository = ReturnType<typeof createAttachmentsRepository>;

/** Attachments of notes and tasks; `uploadsDir` holds the files under their stored names. */
export function createAttachmentsRepository(db: Db, uploadsDir: string) {
  const activities = createActivityRepository(db);
  // Only notes and tasks outside the trash take attachments, and only their attachments are served.
  const selectOwner = {
    note: db.prepare<[number], { project_id: number; title: string }>(`SELECT project_id, title FROM live_notes WHERE id = ?`),
    task: db.prepare<[number], { project_id: number; title: string }>(`SELECT project_id, title FROM live_tasks WHERE id = ?`),
  };
  const selectAttachment = db.prepare<[number], AttachmentRow>(
    `SELECT a.* FROM attachments a
     WHERE a.id = ? AND (a.note_id IN (SELECT id FROM live_notes) OR a.task_id IN (SELECT id FROM live_tasks))`,
  );
  const insert = db.prepare<[number, number | null, number | null, string, string, string, number, string], AttachmentRow>(
    `INSERT INTO attachments (project_id, note_id, task_id, file_name, stored_name, mime_type, size, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  );
  const deleteRow = db.prepare<[number]>(`DELETE FROM attachments WHERE id = ?`);
  const selectStoredNames = db.prepare<[], { stored_name: string }>(`SELECT stored_name FROM attachments`);
  const selectProjectNoteFiles = db.prepare<[number], AttachmentRow>(
    `SELECT a.* FROM attachments a JOIN live_notes n ON n.id = a.note_id WHERE n.project_id = ? ORDER BY a.id`,
  );

  const filePath = (storedName: string) => path.join(uploadsDir, storedName);
  // Created when the first upload arrives (see ensureFolders), so a server without attachments leaves no folders.
  const incomingDir = path.join(uploadsDir, INCOMING_DIR);

  function removeFile(file: string): void {
    try {
      fs.rmSync(file, { force: true });
    } catch {
      // A file that cannot be removed now is swept away later.
    }
  }

  return {
    uploadsDir,
    /** Where multer writes uploads. */
    incomingDir,

    /** Creates the uploads and incoming folders if needed. */
    ensureFolders(): void {
      fs.mkdirSync(incomingDir, { recursive: true });
    },

    /** Whether the note or task exists outside the trash, so uploads can be refused before reading them. */
    ownerExists: (owner: AttachmentOwner) => selectOwner[owner.type].get(owner.id) !== undefined,

    /**
     * Records uploaded files and moves them from the incoming folder into place. Returns undefined (and
     * removes the files) if the note or task is gone meanwhile.
     */
    add: db.transaction((owner: AttachmentOwner, uploads: StoredUpload[]): Attachment[] | undefined => {
      const parent = selectOwner[owner.type].get(owner.id);
      if (!parent) {
        for (const upload of uploads) removeFile(path.join(incomingDir, upload.storedName));
        return undefined;
      }
      // Moved before the rows are written: if a move fails, the transaction is rolled back and no row points
      // at a missing file.
      for (const upload of uploads) fs.renameSync(path.join(incomingDir, upload.storedName), filePath(upload.storedName));
      const now = new Date().toISOString();
      const rows = uploads.map((u) =>
        insert.get(
          parent.project_id,
          owner.type === 'note' ? owner.id : null,
          owner.type === 'task' ? owner.id : null,
          u.fileName,
          u.storedName,
          u.mimeType,
          u.size,
          now,
        )!,
      );
      activities.record({
        projectId: parent.project_id,
        entityType: owner.type,
        entityId: owner.id,
        actionType: 'update',
        description: text.filesAttached(owner.type, parent.title, uploads.map((u) => u.fileName)),
        metadata: { title: parent.title, attached: uploads.map((u) => u.fileName) },
      });
      return rows.map(toAttachment);
    }),

    /** The files of all notes of a project outside the trash, by note id, oldest first (for the notes export). */
    noteFiles(projectId: number): Map<number, { fileName: string; path: string }[]> {
      const byNote = new Map<number, { fileName: string; path: string }[]>();
      for (const row of selectProjectNoteFiles.all(projectId)) {
        if (!fs.existsSync(filePath(row.stored_name))) continue;
        byNote.set(row.note_id!, [...(byNote.get(row.note_id!) ?? []), { fileName: row.file_name, path: filePath(row.stored_name) }]);
      }
      return byNote;
    },

    /** The attachment and where its file is; undefined if it does not exist or its owner is in the trash. */
    file(id: number): { attachment: Attachment; path: string } | undefined {
      const row = selectAttachment.get(id);
      return row && { attachment: toAttachment(row), path: filePath(row.stored_name) };
    },

    /** Deletes the attachment and its file for good. False if it does not exist (or its owner is in the trash). */
    remove(id: number): boolean {
      const row = selectAttachment.get(id);
      if (!row) return false;
      const owner: AttachmentOwner = row.note_id !== null ? { type: 'note', id: row.note_id } : { type: 'task', id: row.task_id! };
      db.transaction(() => {
        deleteRow.run(id);
        const parent = selectOwner[owner.type].get(owner.id)!;
        activities.record({
          projectId: row.project_id,
          entityType: owner.type,
          entityId: owner.id,
          actionType: 'update',
          description: text.fileRemoved(owner.type, parent.title, row.file_name),
          metadata: { title: parent.title, removed: row.file_name },
        });
      })();
      removeFile(filePath(row.stored_name));
      return true;
    },

    /**
     * Deletes files that no attachment refers to any more: after notes, tasks or projects were purged (the
     * database removes their rows by cascade), and uploads left behind by a crash. Incoming files are only
     * removed once they are old, since their upload may still be running. Returns how many were removed.
     */
    sweep(now = Date.now()): number {
      const known = new Set(selectStoredNames.all().map((r) => r.stored_name));
      let removed = 0;
      const remove = (file: string) => {
        try {
          fs.rmSync(file, { force: true });
          removed++;
        } catch {
          // Try again next time.
        }
      };
      const list = (dir: string) => {
        try {
          return fs.readdirSync(dir, { withFileTypes: true });
        } catch {
          return []; // no uploads yet
        }
      };
      for (const entry of list(uploadsDir)) {
        if (entry.isFile() && !known.has(entry.name)) remove(filePath(entry.name));
      }
      for (const entry of list(incomingDir)) {
        const file = path.join(incomingDir, entry.name);
        try {
          if (entry.isFile() && now - fs.statSync(file).mtimeMs >= INCOMING_MAX_AGE_MS) remove(file);
        } catch {
          // Gone meanwhile.
        }
      }
      return removed;
    },
  };
}

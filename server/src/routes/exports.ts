import { Router } from 'express';
import { HttpError, notFound } from '../errors.js';
import type { Access } from '../auth/access.js';
import { attachmentDisposition, boardToCsv, noteToHtml, noteToMarkdown, safeFileName, uniqueNames } from '../exports.js';
import type { AttachmentsRepository } from '../repositories/attachmentsRepository.js';
import type { BoardRepository } from '../repositories/boardRepository.js';
import type { NotesRepository } from '../repositories/notesRepository.js';
import type { ProjectsRepository } from '../repositories/projectsRepository.js';
import type { TasksRepository } from '../repositories/tasksRepository.js';
import { exportQuerySchema, idParamSchema, importNotesSchema } from '../validation.js';
import { createZipStream, isCompressible } from '../zipStream.js';

interface Repositories {
  access: Access;
  projects: ProjectsRepository;
  notes: NotesRepository;
  tasks: TasksRepository;
  board: BoardRepository;
  attachments: AttachmentsRepository;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Notes as Markdown/HTML, the board as CSV, and the notes import. Mounted at /api. */
export function exportsRouter({ access, projects, notes, tasks, board, attachments }: Repositories): Router {
  const router = Router();

  const projectOf = (raw: unknown) => {
    const id = idParamSchema.parse(raw);
    const project = projects.get(id);
    if (!project) throw notFound('Project not found');
    return project;
  };

  router.get('/notes/:id/export', access.requireRole('viewer', access.of.note()), (req, res) => {
    const note = notes.get(idParamSchema.parse(req.params.id));
    if (!note) throw notFound('Note not found');
    const { format } = exportQuerySchema.parse(req.query);
    res.setHeader('Content-Type', format === 'md' ? 'text/markdown; charset=utf-8' : 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', attachmentDisposition(`${safeFileName(note.title)}.${format}`));
    // A single file: attachments stay out (the notes export of the project has them).
    res.send(format === 'md' ? noteToMarkdown(note) : noteToHtml(note));
  });

  /** All notes of the project as files in a ZIP, each note's attachments in a folder named like the note. */
  router.get('/projects/:projectId/export/notes', access.requireRole('viewer', access.of.project()), async (req, res) => {
    const project = projectOf(req.params.projectId);
    const { format } = exportQuerySchema.parse(req.query);
    // Older notes first among equal titles, so they keep the plain file name.
    const list = notes.list(project.id).sort((a, b) => a.title.localeCompare(b.title, 'de', { sensitivity: 'base' }) || a.id - b.id);
    const names = uniqueNames(list.map((n) => safeFileName(n.title)));
    const files = attachments.noteFiles(project.id);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', attachmentDisposition(`${safeFileName(project.name, 'Projekt')} – Notizen ${today()}.zip`));
    const zip = createZipStream(res);
    try {
      for (const [i, note] of list.entries()) {
        const own = files.get(note.id) ?? [];
        const fileNames = uniqueNames(own.map((f) => safeFileName(f.fileName, 'Anhang')));
        const folder = `Anhänge/${names[i]}`;
        const linked = { ...note, files: fileNames.map((name) => ({ name, href: `${folder}/${name}` })) };
        await zip.addText(`${names[i]}.${format}`, format === 'md' ? noteToMarkdown(linked) : noteToHtml(linked));
        for (const [j, file] of own.entries()) await zip.addFile(`${folder}/${fileNames[j]}`, file.path, isCompressible(file.fileName));
      }
      await zip.end();
    } catch (error) {
      console.error(error);
      res.destroy();
    }
  });

  router.get('/projects/:projectId/export/board.csv', access.requireRole('viewer', access.of.project()), (req, res) => {
    const project = projectOf(req.params.projectId);
    if (project.kind === 'notebook') throw new HttpError(409, 'notebook', 'Notebooks have no board');
    const csv = boardToCsv(tasks.list(project.id), board.listColumns(project.id), board.listLanes(project.id));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', attachmentDisposition(`${safeFileName(project.name, 'Projekt')} – Board ${today()}.csv`));
    res.send(csv);
  });

  /** One batch of notes from the import wizard (which parses the files in the browser). */
  router.post('/projects/:projectId/import/notes', access.requireRole('member', access.of.project()), (req, res) => {
    const project = projectOf(req.params.projectId);
    const { notes: batch } = importNotesSchema.parse(req.body);
    if (batch.length === 0) throw new HttpError(400, 'invalid_input', 'No notes');
    res.status(201).json({ created: notes.importMany(project.id, batch) });
  });

  return router;
}

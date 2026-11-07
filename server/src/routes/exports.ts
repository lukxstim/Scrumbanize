import { Router, type Request } from 'express';
import { userOf } from '../auth/middleware.js';
import { HttpError, notFound } from '../errors.js';
import type { Access } from '../auth/access.js';
import { attachmentDisposition, boardToCsv, exportContentLinks, noteToHtml, noteToMarkdown, safeFileName, uniqueNames } from '../exports.js';
import { buildCalendar } from '../ics.js';
import type { AttachmentsRepository } from '../repositories/attachmentsRepository.js';
import type { CalendarFeedsRepository } from '../repositories/calendarFeedsRepository.js';
import type { BoardRepository } from '../repositories/boardRepository.js';
import type { NotesRepository } from '../repositories/notesRepository.js';
import type { ProjectsRepository } from '../repositories/projectsRepository.js';
import type { TasksRepository } from '../repositories/tasksRepository.js';
import { changed } from '../realtime/events.js';
import { exportQuerySchema, idParamSchema, importNotesSchema } from '../validation.js';
import { createZipStream, isCompressible } from '../zipStream.js';
import { taskEvent } from './calendar.js';

interface Repositories {
  access: Access;
  projects: ProjectsRepository;
  notes: NotesRepository;
  tasks: TasksRepository;
  board: BoardRepository;
  attachments: AttachmentsRepository;
  calendarFeeds: CalendarFeedsRepository;
}

const today = () => new Date().toISOString().slice(0, 10);

type Zip = ReturnType<typeof createZipStream>;
type ExportFormat = 'md' | 'html';

/** What the personal export holds, for whoever opens it later. */
const EXPORT_README = (date: string, user: string) => `Scrumbanize – Export vom ${date} für ${user}

Notizbücher/   Jedes Notizbuch ein Ordner: jede Notiz als Datei, ihre Anhänge unter „Anhänge“.
Aufgaben/      Die Aufgaben jedes Boards als CSV-Datei (für Excel).
Kalender.ics   Alle Aufgaben mit Start- oder Fälligkeitsdatum, zum Importieren in Outlook, Google oder Apple Kalender.

Notizen lassen sich in Scrumbanize wieder einlesen: Einstellungen → „Notizen importieren“ und den Ordner eines
Notizbuchs (oder diese ZIP-Datei) auswählen.
`;

/** Notes as Markdown/HTML, the board as CSV, and the notes import. Mounted at /api. */
export function exportsRouter({ access, projects, notes, tasks, board, attachments, calendarFeeds }: Repositories): Router {
  const router = Router();

  const projectOf = (raw: unknown) => {
    const id = idParamSchema.parse(raw);
    const project = projects.get(id);
    if (!project) throw notFound('Project not found');
    return project;
  };

  /** The notes of a project into the ZIP under `folder` ('' for the top): one file each, attachments beside them. */
  async function addNotes(zip: Zip, projectId: number, format: ExportFormat, folder = '') {
    // Older notes first among equal titles, so they keep the plain file name.
    const list = notes.list(projectId).sort((a, b) => a.title.localeCompare(b.title, 'de', { sensitivity: 'base' }) || a.id - b.id);
    const names = uniqueNames(list.map((n) => safeFileName(n.title)));
    const files = attachments.noteFiles(projectId);
    // Links between the exported notes point to their files (US-22).
    const fileOfNote = new Map(list.map((note, i) => [note.id, `${names[i]}.${format}`]));
    const fileOf = (ref: { type: string; id: number }) => (ref.type === 'note' ? fileOfNote.get(ref.id) : undefined);
    for (const [i, note] of list.entries()) {
      const own = files.get(note.id) ?? [];
      const fileNames = uniqueNames(own.map((f) => safeFileName(f.fileName, 'Anhang')));
      const attachmentFolder = `Anhänge/${names[i]}`;
      const linked = {
        ...note,
        content: exportContentLinks(note.content, fileOf),
        files: fileNames.map((name) => ({ name, href: `${attachmentFolder}/${name}` })),
      };
      await zip.addText(`${folder}${names[i]}.${format}`, format === 'md' ? noteToMarkdown(linked) : noteToHtml(linked));
      for (const [j, file] of own.entries()) await zip.addFile(`${folder}${attachmentFolder}/${fileNames[j]}`, file.path, isCompressible(file.fileName));
    }
  }

  router.get('/notes/:id/export', access.requireRole('viewer', access.of.note()), (req, res) => {
    const note = notes.get(idParamSchema.parse(req.params.id));
    if (!note) throw notFound('Note not found');
    const { format } = exportQuerySchema.parse(req.query);
    res.setHeader('Content-Type', format === 'md' ? 'text/markdown; charset=utf-8' : 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', attachmentDisposition(`${safeFileName(note.title)}.${format}`));
    // A single file: attachments stay out (the notes export of the project has them), links become text.
    const plain = { ...note, content: exportContentLinks(note.content) };
    res.send(format === 'md' ? noteToMarkdown(plain) : noteToHtml(plain));
  });

  /** All notes of the project as files in a ZIP, each note's attachments in a folder named like the note. */
  router.get('/projects/:projectId/export/notes', access.requireRole('viewer', access.of.project()), async (req, res) => {
    const project = projectOf(req.params.projectId);
    const { format } = exportQuerySchema.parse(req.query);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', attachmentDisposition(`${safeFileName(project.name, 'Projekt')} – Notizen ${today()}.zip`));
    const zip = createZipStream(res);
    try {
      await addNotes(zip, project.id, format);
      await zip.end();
    } catch (error) {
      console.error(error);
      res.destroy();
    }
  });

  /**
   * Everything of the logged-in person in one ZIP (for everyone, not only administrators): every notebook they may
   * see with its notes and attachments, the tasks of every board as CSV, and their dated tasks as a calendar (.ics).
   * Also what the backup scripts for a Mac and for Windows download (deploy/mac-backup, deploy/windows-backup).
   */
  router.get('/account/export', async (req: Request, res) => {
    const user = userOf(res)!;
    const { format } = exportQuerySchema.parse(req.query);
    const roles = access.roles(user);
    const visible = projects.list().filter((project) => roles.has(project.id));
    const date = today();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', attachmentDisposition(`Scrumbanize – Export ${date}.zip`));
    const zip = createZipStream(res);
    try {
      await zip.addText('LIESMICH.txt', EXPORT_README(date, user.name));
      const folders = uniqueNames(visible.map((project) => safeFileName(project.name, 'Notizbuch')));
      for (const [i, project] of visible.entries()) await addNotes(zip, project.id, format, `Notizbücher/${folders[i]}/`);
      for (const [i, project] of visible.entries()) {
        if (project.kind === 'notebook') continue;
        await zip.addText(`Aufgaben/${folders[i]}.csv`, boardToCsv(tasks.list(project.id), board.listColumns(project.id), board.listLanes(project.id)));
      }
      const origin = `${req.protocol}://${req.get('host') ?? 'localhost'}`;
      const events = calendarFeeds.tasks(new Set(visible.map((project) => project.id))).map((task) => taskEvent(task, origin));
      await zip.addText('Kalender.ics', buildCalendar({ name: 'Scrumbanize', events, now: new Date() }));
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
    const created = notes.importMany(project.id, batch);
    changed(res, project.id, { type: 'notes.imported' });
    res.status(201).json({ created });
  });

  return router;
}

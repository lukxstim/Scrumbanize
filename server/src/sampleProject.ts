import { text } from './activityText.js';
import type { Db } from './database.js';
import { createActivityRepository } from './repositories/activityRepository.js';
import { createBoardRepository } from './repositories/boardRepository.js';
import { createMetaRepository } from './repositories/metaRepository.js';
import { createNotesRepository } from './repositories/notesRepository.js';
import { createProjectsRepository } from './repositories/projectsRepository.js';
import { createTasksRepository } from './repositories/tasksRepository.js';
import type { TaskPriority } from './validation.js';

export const SAMPLE_PROJECT_NAME = 'Willkommen bei Scrumbanize';

/** The local calendar date `days` after `now`, as YYYY-MM-DD. */
function dateFrom(now: Date, days: number): string {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const WELCOME_NOTE = `# Schön, dass du da bist!

Scrumbanize verbindet **Notizen** mit einem **Scrumban-Board**: Gedanken festhalten, daraus Aufgaben machen und sie bis „Done“ begleiten. Dieses Projekt ist ein Beispiel – schau dich um, ändere alles und lösche es, wenn du es nicht mehr brauchst.

## Erste Schritte

- [ ] Eine eigene Notiz anlegen („Neue Notiz“ oben links)
- [ ] Text markieren und „Auswahl in Task umwandeln“ ausprobieren
- [ ] Auf dem Board eine Karte in die nächste Spalte ziehen
- [ ] Im Kalender einen Termin auf einen anderen Tag ziehen
- [ ] Etwas löschen und im Papierkorb wiederherstellen

## Gut zu wissen

- Mit <mark data-color="yellow">Strg+K</mark> öffnest du die Befehlspalette: suchen, Projekte wechseln, Notizen und Tasks anlegen.
- Die <mark data-color="green">Uhr</mark> oben rechts zeigt, was zuletzt passiert ist; daneben liegt der <mark data-color="blue">Papierkorb</mark>.
- Tasks können Priorität, Fälligkeit, Checklisten, Anhänge und Verknüpfungen haben.
- Die Einführung startest du jederzeit wieder über die Befehlspalette: „Einführung erneut starten“.

## Tastenkürzel

| Kürzel | Funktion |
| --- | --- |
| Strg+K | Befehlspalette |
| Strg+B / Strg+I | Fett / kursiv im Editor |
| Leertaste | Karte auf dem Board aufnehmen und ablegen |
| Enter | Task öffnen |`;

interface SampleTask {
  title: string;
  description?: string;
  column: number;
  priority?: TaskPriority;
  startDate?: string;
  dueDate?: string;
  fromNote?: boolean;
}

/**
 * Creates the sample project of the first start: a welcome note and tasks spread over the board that show
 * priorities, dates, a checklist, a link and the note-to-task connection. Dates are relative to `now`.
 * Logged as one entry instead of one per note and task. Returns the project's id.
 */
export function seedSampleProject(db: Db, now = new Date()): number {
  const projects = createProjectsRepository(db);
  const board = createBoardRepository(db);
  const notes = createNotesRepository(db);
  const tasks = createTasksRepository(db);
  const activities = createActivityRepository(db);
  const meta = createMetaRepository(db);

  return db.transaction(() => {
    const created = projects.create({ name: SAMPLE_PROJECT_NAME, color: 'indigo' });
    if (!created.ok) throw new Error(`Sample project could not be created: ${created.reason}`);
    const projectId = created.project.id;
    const columns = board.listColumns(projectId);
    const lane = board.listLanes(projectId)[0]!;

    const note = notes.create(projectId, { title: 'So funktioniert Scrumbanize', content: WELCOME_NOTE, tags: ['beispiel', 'einstieg'] });

    const day = (offset: number) => dateFrom(now, offset);
    const sample: SampleTask[] = [
      { title: 'Notiz in Task umwandeln ausprobieren', column: 0, priority: 'low', fromNote: true },
      {
        title: 'Board kennenlernen',
        column: 1,
        description: '- [ ] Karte per Drag-and-Drop verschieben\n- [ ] WIP-Limit einer Spalte ändern\n- [ ] Nach Priorität sortieren',
      },
      { title: 'Termin im Kalender verschieben', column: 1, priority: 'medium', dueDate: day(2), fromNote: true },
      {
        title: 'Erstes eigenes Projekt anlegen',
        column: 2,
        priority: 'high',
        startDate: day(0),
        dueDate: day(4),
        description: 'Über den Projektnamen oben links: „Neues Projekt“. Jedes Projekt hat eigene Notizen, Spalten und Swimlanes.',
      },
      {
        title: 'Abhängigkeit verstehen',
        column: 2,
        description: 'Dieser Task wird von „Erstes eigenes Projekt anlegen“ blockiert – deshalb zeigt die Karte „Blockiert“.',
      },
      { title: 'Dringendes Beispiel', column: 3, priority: 'urgent', dueDate: day(-1), description: 'Überfällige Tasks werden rot markiert.' },
      { title: 'Scrumbanize installiert 🎉', column: 4 },
    ];

    const ids = sample.map((t) => {
      const task = tasks.create(projectId, {
        title: t.title,
        description: t.description ?? '',
        laneId: lane.id,
        ...(t.fromNote ? { sourceNoteId: note.id } : {}),
        priority: t.priority ?? null,
        startDate: t.startDate ?? null,
        dueDate: t.dueDate ?? null,
      });
      const column = columns[Math.min(t.column, columns.length - 1)]!;
      if (column.id !== task.columnId) tasks.move(task.id, column.id, lane.id, Number.MAX_SAFE_INTEGER);
      return task.id;
    });
    tasks.addLink(ids[4]!, ids[3]!, 'blocked_by');

    // One entry for the whole sample instead of one per note, task and link.
    db.prepare(`DELETE FROM activities WHERE project_id = ?`).run(projectId);
    activities.record({
      projectId,
      entityType: 'project',
      entityId: projectId,
      actionType: 'create',
      description: text.sampleProjectCreated(),
      metadata: { name: SAMPLE_PROJECT_NAME, sample: true },
    });

    meta.set('sample_project_id', String(projectId));
    meta.set('sample_seeded_at', now.toISOString());
    return projectId;
  })();
}

import { text, type LinkKind } from './activityText.js';
import type { Db } from './database.js';
import { createActivityRepository } from './repositories/activityRepository.js';
import { createBoardRepository } from './repositories/boardRepository.js';
import { createLabelsRepository } from './repositories/labelsRepository.js';
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

/** "Donnerstag, 15.10.2026", as the "Meeting-Protokoll" template writes the date. */
function germanDate(now: Date): string {
  const weekdays = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${weekdays[now.getDay()]}, ${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
}

// Headings and lists only, apart from the table at the end, so "Als Mindmap" shows the whole guide.
const WELCOME_NOTE = `# Schön, dass du da bist!

Scrumbanize verbindet **Notizen** mit einem **Scrumban-Board**: Gedanken festhalten, daraus Aufgaben machen und sie bis „Done“ begleiten – im Browser, unter Windows und auf dem Mac. Dieses Projekt ist ein Beispiel – schau dich um, ändere alles und lösche es, wenn du es nicht mehr brauchst.

## Erste Schritte

- [ ] Eine eigene Notiz anlegen („Neue Notiz“ oben links)
- [ ] Text markieren und „Auswahl in Task umwandeln“ ausprobieren
- [ ] Auf dem Board eine Karte in die nächste Spalte ziehen
- [ ] Im Kalender einen Termin auf einen anderen Tag ziehen
- [ ] Etwas löschen und im Papierkorb wiederherstellen

## Mehr entdecken

- [ ] Board: eine Spalte am rechten Rand ihrer Überschrift breiter ziehen, dann „⋯“ → „An Fenster anpassen“
- [ ] Notizen → „Graph“: Notizen und Tasks als Netzwerk ansehen
- [ ] Diese Notiz „Als Mindmap“ anzeigen (Knopf über dem Editor)
- [ ] „Statistiken“ öffnen: Velocity und Durchlaufzeiten füllen sich, sobald Tasks in „Done“ ankommen
- [ ] Eine Notiz aus der Vorlage „Meeting-Protokoll“ anlegen (Pfeil neben „Neue Notiz“)
- [ ] In den Einstellungen (Zahnrad oben rechts) ein Backup herunterladen

## Desktop-App

- Ist ein Task heute fällig oder überfällig, meldet sich Scrumbanize mit einer <mark data-color="yellow">Erinnerung</mark> – unter Windows als Benachrichtigung, auf dem Mac als Mitteilung.
- <mark data-color="green">Strg+Umschalt+Leertaste</mark> (Mac: ⌘⇧Leertaste) holt Scrumbanize von überall nach vorne.
- Das Symbol neben der Uhr (Windows) bzw. in der Menüleiste (Mac) öffnet Scrumbanize und prüft die Erinnerungen.
- Einstellungen → „Desktop-App“: im Infobereich weiterlaufen, beim Anmelden starten, Tastenkombination ändern.
- Auf dem Mac läuft Scrumbanize nach dem Schließen des Fensters im Dock weiter; beenden mit ⌘Q.

## Gut zu wissen

- Mit <mark data-color="yellow">Strg+K</mark> (Mac: ⌘K) öffnest du die Befehlspalette: suchen, Projekte wechseln, Notizen und Tasks anlegen.
- Die <mark data-color="green">Uhr</mark> oben rechts zeigt, was zuletzt passiert ist; daneben liegen der <mark data-color="blue">Papierkorb</mark> und die Einstellungen.
- Tasks können Priorität, Fälligkeit, Labels, Checklisten, Anhänge und Verknüpfungen haben.
- Die Einführung startest du jederzeit wieder über die Befehlspalette: „Einführung erneut starten“.

## Tastenkürzel

| Funktion | Windows | Mac |
| --- | --- | --- |
| Befehlspalette | Strg+K | ⌘K |
| Fett / kursiv im Editor | Strg+B / Strg+I | ⌘B / ⌘I |
| Scrumbanize nach vorne holen | Strg+Umschalt+Leertaste | ⌘⇧Leertaste |
| Karte auf dem Board aufnehmen und ablegen | Leertaste | Leertaste |
| Task öffnen | Enter | Enter |
| Spalte breiter / schmaler (Rand der Überschrift) | ← / → | ← / → |`;

/** A note as the "Meeting-Protokoll" template creates it, so the graph shows a second note with its tasks. */
function meetingNote(now: Date): string {
  return `**Datum:** ${germanDate(now)}, 10:00 Uhr
**Teilnehmende:** Du und Scrumbanize

## Agenda

- Was kann Scrumbanize?
- Wie bleiben die Daten sicher?

## Notizen

Diese Notiz ist aus der Vorlage „Meeting-Protokoll“ entstanden. Die Aufgaben unten sind mit „Auswahl in Task umwandeln“ zu Tasks geworden – im Graph hängen sie an dieser Notiz.

## Entscheidungen

- Regelmäßig ein Backup machen
- Erinnerungen an fällige Tasks eingeschaltet lassen

## Aufgaben

- [ ] Backup herunterladen
- [ ] Erinnerung ausprobieren`;
}

interface SampleTask {
  title: string;
  description?: string;
  column: number;
  priority?: TaskPriority;
  startDate?: string;
  dueDate?: string;
  /** The note the task was converted from. */
  from?: 'welcome' | 'meeting';
  labels?: string[];
}

/**
 * Creates the sample project of the first start: a welcome note that doubles as a guide (and as a mindmap), a
 * meeting note as the template creates it, and tasks spread over the board that show priorities, dates, labels,
 * a checklist, links and the note-to-task connection, and point to the statistics, the settings and the desktop
 * app. Dates are relative to `now`. Logged as one entry instead of one per note and task. Returns the project's id.
 */
export function seedSampleProject(db: Db, now = new Date()): number {
  const projects = createProjectsRepository(db);
  const board = createBoardRepository(db);
  const labels = createLabelsRepository(db);
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
    // The starter labels every new project gets: Bug, Feature, Dringend.
    const labelIds = new Map(labels.list(projectId).map((l) => [l.name, l.id]));

    const sourceNotes = {
      welcome: notes.create(projectId, { title: 'So funktioniert Scrumbanize', content: WELCOME_NOTE, tags: ['beispiel', 'einstieg'] }),
      meeting: notes.create(projectId, { title: 'Meeting: Projektstart', content: meetingNote(now), tags: ['beispiel', 'meeting'] }),
    };

    const day = (offset: number) => dateFrom(now, offset);
    const sample: SampleTask[] = [
      { title: 'Notiz in Task umwandeln ausprobieren', column: 0, priority: 'low', from: 'welcome', labels: ['Feature'] },
      {
        title: 'Statistiken ansehen',
        column: 0,
        description:
          'Unter „Statistiken“ zeigt Scrumbanize, wie viele Tasks pro Woche fertig werden (Velocity), wie lange sie vom Anlegen bzw. vom Arbeitsbeginn bis „Done“ brauchen (Lead Time und Cycle Time) und wann eine Spalte über ihrem WIP-Limit lag.\n\nDie Zahlen kommen aus dem Verlauf dieses Projekts – sie füllen sich, sobald du Tasks bis „Done“ ziehst.',
      },
      {
        title: 'Board kennenlernen',
        column: 1,
        description:
          '- [ ] Karte per Drag-and-Drop verschieben\n- [ ] WIP-Limit einer Spalte ändern\n- [ ] Nach Priorität sortieren und nach Label filtern\n- [ ] Spalte am rechten Rand der Überschrift breiter ziehen (Doppelklick setzt zurück)\n- [ ] „⋯“ rechts über dem Board → „An Fenster anpassen“',
        labels: ['Feature'],
      },
      { title: 'Termin im Kalender verschieben', column: 1, priority: 'medium', dueDate: day(2), from: 'welcome' },
      {
        title: 'Backup herunterladen',
        column: 1,
        priority: 'medium',
        from: 'meeting',
        description:
          'Zahnrad oben rechts → „Backup herunterladen“: eine ZIP-Datei mit allen Projekten, Notizen, Tasks und Anhängen. Dort kannst du ein Backup auch wiederherstellen, Notizen importieren (Markdown, Obsidian, Notion) und exportieren (Markdown, HTML, CSV für Excel).',
      },
      {
        title: 'Erstes eigenes Projekt anlegen',
        column: 2,
        priority: 'high',
        startDate: day(0),
        dueDate: day(4),
        description: 'Über den Projektnamen oben links: „Neues Projekt“. Jedes Projekt hat eigene Notizen, Spalten, Swimlanes und Labels.',
      },
      {
        title: 'Abhängigkeit verstehen',
        column: 2,
        description: 'Dieser Task wird von „Erstes eigenes Projekt anlegen“ blockiert – deshalb zeigt die Karte „Blockiert“.',
      },
      {
        title: 'Erinnerung ausprobieren',
        column: 2,
        dueDate: day(0),
        from: 'meeting',
        // Not on "Dringendes Beispiel", whose priority already reads "Dringend".
        labels: ['Dringend'],
        description:
          'Nur in der Desktop-App: Dieser Task ist heute fällig, deshalb erinnert dich Scrumbanize daran – unter Windows mit einer Benachrichtigung, auf dem Mac mit einer Mitteilung (beim ersten Mal fragt der Mac, ob er sie zeigen darf). Gleich ausprobieren: Einstellungen → „Desktop-App“ → „Jetzt prüfen“.\n\n- Strg+Umschalt+Leertaste (Mac: ⌘⇧Leertaste) holt Scrumbanize von überall nach vorne.\n- Das Symbol neben der Uhr (Windows) bzw. in der Menüleiste (Mac) öffnet Scrumbanize.',
      },
      {
        title: 'Dringendes Beispiel',
        column: 3,
        priority: 'urgent',
        dueDate: day(-1),
        description: 'Überfällige Tasks werden rot markiert – und in der Desktop-App gibt es dafür eine Erinnerung.',
      },
      {
        title: 'Vorlage „Bug-Report“ ausprobieren',
        column: 3,
        priority: 'high',
        description:
          'Unter „+ Task“ eine Vorlage wählen: „Bug-Report“ legt einen Task mit Gliederung, Priorität „Hoch“ und dem Label „Bug“ an. Vorlagen verwaltest du in den Einstellungen; Platzhalter wie {{datum}} werden beim Anlegen ausgefüllt.',
        labels: ['Bug'],
      },
      {
        title: 'Scrumbanize installiert 🎉',
        column: 4,
        description:
          'Neue Versionen gibt es für Windows (Installer `Scrumbanize-Setup-….exe`) und den Mac (`Scrumbanize-…-universal.dmg`, für Apple-Chip und Intel). Die App erinnert alle paar Wochen daran, nach einer neuen Version zu schauen.',
      },
    ];

    const ids = new Map<string, number>();
    for (const t of sample) {
      const task = tasks.create(projectId, {
        title: t.title,
        description: t.description ?? '',
        laneId: lane.id,
        ...(t.from ? { sourceNoteId: sourceNotes[t.from].id } : {}),
        priority: t.priority ?? null,
        startDate: t.startDate ?? null,
        dueDate: t.dueDate ?? null,
        labelIds: (t.labels ?? []).flatMap((name) => labelIds.get(name) ?? []),
      });
      const column = columns[Math.min(t.column, columns.length - 1)]!;
      if (column.id !== task.columnId) tasks.move(task.id, column.id, lane.id, Number.MAX_SAFE_INTEGER);
      ids.set(t.title, task.id);
    }
    const link = (from: string, to: string, kind: LinkKind) => tasks.addLink(ids.get(from)!, ids.get(to)!, kind);
    link('Abhängigkeit verstehen', 'Erstes eigenes Projekt anlegen', 'blocked_by');
    link('Erinnerung ausprobieren', 'Dringendes Beispiel', 'relates');

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

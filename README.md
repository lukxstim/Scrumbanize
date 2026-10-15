# Scrumbanize

Selbstgehostete Web-App, die Notizen und ein Scrumban-Board verbindet. Hintergrund und Ziele: [docs/vision.md](docs/vision.md), User Stories: [docs/stories](docs/stories).

**Stand:** US-01 bis US-04 sind umgesetzt:

- **Projekte:** Notizen und Board sind nach Projekten getrennt (z. B. „Privat“, „Studium“). Projekte werden im Header gewechselt, angelegt, umbenannt, eingefärbt und gelöscht (Bestätigung durch Eintippen des Namens; das letzte Projekt bleibt erhalten). Beim ersten Start gibt es das Projekt „Allgemein“; das zuletzt geöffnete Projekt merkt sich der Browser.
- **Notizen** (`/p/:projectId/notes`): Titel, Markdown-Inhalt und Tags, Auto-Save, Live-Suche und Tag-Filter.
- **Task-Umwandlung:** ganze Notizen oder markierte Textpassagen über ein vorausgefülltes Formular in Tasks im Backlog desselben Projekts umwandeln; Notiz und Task sind gegenseitig verlinkt.
- **Scrumban-Board** (`/p/:projectId/board`, Task-Details unter `/p/:projectId/tasks/:id`): Spalten Backlog, To Do, In Progress, Review, Done; Verschieben per Drag-and-Drop (Maus, Touch, Tastatur: Leertaste aufnehmen, Pfeiltasten, Leertaste ablegen) oder ◀ ▶; WIP-Limits für To Do, In Progress und Review (nur Warnung, nicht blockierend); Tasks direkt im Backlog anlegen, bearbeiten und löschen.

Die App ist für einen einzelnen Nutzer ohne Login gedacht – betreibe sie nur in einem vertrauenswürdigen Netz oder hinter einem Reverse-Proxy mit Authentifizierung.

## Betrieb mit Docker

```sh
docker compose up -d --build
```

Die App läuft danach auf <http://localhost:3000>. Ein anderer Port lässt sich mit `SCRUMBANIZE_PORT=8080 docker compose up -d` setzen.

Die SQLite-Datenbank liegt im Volume `scrumbanize-data` (im Container unter `/data/scrumbanize.db`) und bleibt bei Neustarts und Updates erhalten. Backup, während der Container läuft:

```sh
docker compose exec scrumbanize node -e "require('better-sqlite3')('/data/scrumbanize.db').backup('/data/backup.db')"
docker compose cp scrumbanize:/data/backup.db ./backup.db
```

## Entwicklung

Voraussetzung: Node.js 24.

```sh
npm install
npm run dev        # API auf :3000, Vite-Dev-Server auf http://localhost:5173
npm test           # Tests für Server und Client
npm run typecheck
npm run build      # Client nach client/dist, Server nach server/dist
npm start          # Produktionsserver, liefert auch den gebauten Client aus
```

Lokal liegt die Datenbank unter `data/scrumbanize.db` (per `.gitignore` ausgeschlossen).

### Konfiguration (Umgebungsvariablen)

| Variable      | Standard                 | Bedeutung                               |
|---------------|--------------------------|-----------------------------------------|
| `PORT`        | `3000`                   | Port des Servers                        |
| `DATA_DIR`    | `<repo>/data`, Docker: `/data` | Verzeichnis der SQLite-Datenbank   |
| `CLIENT_DIST` | `<repo>/client/dist`     | Gebauter Client, der mit ausgeliefert wird |

## Projektstruktur

npm-Workspaces mit zwei Paketen:

- `server/` – Express-REST-API mit SQLite (`better-sqlite3`). Einstieg `src/index.ts`, App-Aufbau `src/app.ts`, Schema und Migrationen `src/database.ts`.
- `client/` – React-SPA mit TypeScript, Vite und Tailwind CSS.

## REST-API

| Methode | Pfad              | Beschreibung |
|---------|-------------------|--------------|
Listen und Neuanlagen gehören zu einem Projekt (`/api/projects/:projectId/…`). Einzelne Notizen und Tasks werden über ihre projektübergreifend eindeutige ID angesprochen.

| Methode | Pfad              | Beschreibung |
|---------|-------------------|--------------|
| GET     | `/api/health`     | Health-Check |
| GET     | `/api/projects`   | Alle Projekte, alphabetisch, mit `noteCount` und `taskCount` |
| POST    | `/api/projects`   | Projekt anlegen: `{ "name", "color" }` – Farben: `slate`, `red`, `amber`, `emerald`, `sky`, `indigo`, `violet`, `pink`. Namen sind eindeutig (ohne Groß-/Kleinschreibung), sonst 409 |
| PATCH   | `/api/projects/:id` | Name und/oder Farbe ändern |
| DELETE  | `/api/projects/:id` | Projekt mit allen Notizen und Tasks löschen; das letzte Projekt nicht (409) |
| GET     | `/api/projects/:id/notes` | Notizen des Projekts, zuletzt geänderte zuerst. Optional `?q=` (Volltext in Titel, Inhalt, Tags) und `?tag=` (mehrfach möglich, alle müssen passen) |
| POST    | `/api/projects/:id/notes` | Notiz anlegen: `{ "title": "", "content": "", "tags": [] }` |
| GET     | `/api/projects/:id/tags` | Tags der Notizen des Projekts mit Anzahl |
| POST    | `/api/projects/:id/tasks` | Task im Backlog anlegen: `{ "title", "description", "sourceNoteId"? }` – die Notiz muss zum Projekt gehören |
| GET     | `/api/projects/:id/board` | Spalten mit WIP-Limits und alle Tasks des Projekts: `{ "columns", "tasks" }` |
| PATCH   | `/api/projects/:id/board/columns/:status` | WIP-Limit setzen (nur `todo`, `in_progress`, `review`): `{ "wipLimit": number \| null }` |
| GET     | `/api/notes/:id`  | Eine Notiz |
| PUT     | `/api/notes/:id`  | Notiz vollständig ersetzen: `{ "title", "content", "tags" }` |
| DELETE  | `/api/notes/:id`  | Notiz löschen |
| GET     | `/api/tasks/:id`  | Ein Task inkl. Quell-Notiz (`sourceNote`) |
| PATCH   | `/api/tasks/:id`  | Titel und/oder Beschreibung ändern: `{ "title"?, "description"? }` |
| POST    | `/api/tasks/:id/move` | Task innerhalb seines Projekts verschieben: `{ "status", "index" }` – `index` ist die Zielposition unter den übrigen Tasks der Spalte |
| DELETE  | `/api/tasks/:id`  | Task löschen |

Tags werden normalisiert (Kleinschreibung, ohne Kommas, max. 32 Zeichen). Tags, die keine Notiz mehr verwendet, werden automatisch entfernt. Notizen enthalten ihre verknüpften Tasks (`tasks`). Tasks sind Kopien: spätere Änderungen an der Notiz werden nicht übernommen, und beim Löschen einer Notiz bleiben ihre Tasks erhalten. Fehler haben die Form `{ "error": { "code", "message" } }`.

# Scrumbanize

Selbstgehostete Web-App, die Notizen und ein Scrumban-Board verbindet. Hintergrund und Ziele: [docs/vision.md](docs/vision.md), User Stories: [docs/stories](docs/stories).

**Stand:** US-01 (Notizen-Management) ist umgesetzt: Notizen mit Titel, Markdown-Inhalt und Tags anlegen, bearbeiten (mit Auto-Save) und löschen, dazu Live-Suche und Tag-Filter. Die App ist für einen einzelnen Nutzer ohne Login gedacht – betreibe sie nur in einem vertrauenswürdigen Netz oder hinter einem Reverse-Proxy mit Authentifizierung.

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
| GET     | `/api/health`     | Health-Check |
| GET     | `/api/notes`      | Alle Notizen, zuletzt geänderte zuerst. Optional `?q=` (Volltext in Titel, Inhalt, Tags) und `?tag=` (mehrfach möglich, alle müssen passen) |
| GET     | `/api/notes/:id`  | Eine Notiz |
| POST    | `/api/notes`      | Notiz anlegen: `{ "title": "", "content": "", "tags": [] }` |
| PUT     | `/api/notes/:id`  | Notiz vollständig ersetzen (gleicher Body) |
| DELETE  | `/api/notes/:id`  | Notiz löschen |
| GET     | `/api/tags`       | Verwendete Tags mit Anzahl der Notizen |

Tags werden normalisiert (Kleinschreibung, ohne Kommas, max. 32 Zeichen). Tags, die keine Notiz mehr verwendet, werden automatisch entfernt. Fehler haben die Form `{ "error": { "code", "message" } }`.

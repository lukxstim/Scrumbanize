# Vision & Produktkonzept: Scrumbanize

## 1. Einleitung & Zielsetzung
**Scrumbanize** ist eine schlanke, datenschutzfreundliche und vollständig selbstgehostete Web-Anwendung. Sie verbindet die Flexibilität eines persönlichen Notizbuchs mit der strukturierten Projektplanung eines Jira-ähnlichen Scrumban-Boards. 

Das Hauptziel ist es, Reibungsverluste bei der Ideenfindung zu eliminieren: Gedanken, Notizen und Meeting-Memos werden direkt erfasst und per Klick in konkrete, auf dem Board verübare Aufgaben (Tasks) umgewandelt.

## 2. Kernfunktionen (Core Features)
- **Notizen-Management:** Markdown-unterstützte Notizen mit Tags, Kategorien und Echtzeit-Suche.
- **Task-Transformation:** Nahtlose Umwandlung von Notizen oder spezifischen Textabschnitten in strukturierte Aufgaben (Tasks) für das Backlog.
- **Scrumban Board:** Ein visuelles Board (Spalten: *Backlog*, *To Do*, *In Progress*, *Review*, *Done*) mit WIP-Limits (Work in Progress), Priorisierung und Statuswechseln.
- **Selbsthosting & Datensouveränität:** Ausgelegt für den Betrieb über Docker Compose mit einer lokalen SQLite-Datenbank, sodass keine Daten an Dritte abfließen.

## 3. Tech-Stack & Architektur
- **Frontend:** React, TypeScript, Tailwind CSS (Single-Page Application).
- **Backend:** Node.js mit Express (REST API).
- **Datenbank:** SQLite (leichtgewichtig, dateibasiert, ideal für Self-Hosting).
- **Deployment:** Containerisiert via Docker & Docker Compose für Ein-Befehl-Installationen (`docker compose up -d`).

## 4. Zielgruppe
Entwickler, Freelancer und kleine Teams, die eine datenschutzkonforme, schnelle und unkomplizierte Alternative zu überladenen Cloud-Tools wie Jira oder Notion suchen.
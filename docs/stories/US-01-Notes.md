# User Story 01: Notes Management

## Kontext & Ziel
Als Nutzer möchte ich Notizen erstellen, bearbeiten, löschen und mit Tags versehen können, um Gedanken, Meetings und Ideen schnell festzuhalten.

## Fachliche Anforderungen (Acceptance Criteria)
1. **Editor & CRUD:** Nutzer können neue Notizen anlegen (Titel, Markdown-Inhalt), bestehende bearbeiten und löschen.
2. **Tagging:** Jede Notiz kann beliebig viele Tags erhalten, um sie thematisch zu gruppieren.
3. **Live-Suche & Filter:** Eine Suchleiste ermöglicht das Filtern von Notizen nach Titel, Inhalt oder Tags in Echtzeit.
4. **Persistenz:** Notizen werden über das Backend in der SQLite-Datenbank gespeichert und überleben einen Server-Neustart.
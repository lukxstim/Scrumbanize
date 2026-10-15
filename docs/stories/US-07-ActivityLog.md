# User Story 07: Activity Log & Audit Trail

## Kontext & Ziel
Als Nutzer möchte ich eine chronologische Übersicht aller Aktivitäten und Änderungen (z. B. Notiz erstellt, Task verschoben, WIP-Limit geändert, Projekt angelegt) innerhalb meines Projekts einsehen können, um den Verlauf meiner Arbeit nachvollziehen zu können.

## Fachliche Anforderungen (Acceptance Criteria)
1. **Aktivitäts-Erfassung (Logging):**
   - Automatische Protokollierung relevanter Aktionen im Backend (z. B. Note created/edited/deleted, Task status/lane changed, Project created, Task converted).
   - Jedes Log enthält: Timestamp, Aktionstyp, Ziel-Objekt (z. B. Notiz- oder Task-Titel) und Detail-Informationen (z. B. "Status geändert von To Do -> In Progress").
2. **Projektbezogenes Activity Log View:**
   - Eine eigene Ansicht oder ein Drawer/Panel ("Aktivitäten" / "History") im aktuellen Projekt.
   - Filterbarkeit nach Bereich (z. B. *Alle*, *Notizen*, *Tasks*, *Board-Einstellungen*).
3. **Deep Links / Navigation:**
   - Klick auf einen Log-Eintrag führt direkt zur entsprechenden Notiz oder zum Task im Board (sofern noch vorhanden).
4. **Persistenz & Performance:**
   - Gespeichert in SQLite in einer eigenen Tabelle `activities` mit `project_id`.
   - Paginierung oder Lazy Loading / Infinite Scroll für performantes Laden vieler Einträge.
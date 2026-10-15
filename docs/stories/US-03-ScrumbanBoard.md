# User Story 03: Scrumban Board

## Kontext & Ziel
Als Nutzer möchte ich meine Aufgaben auf einem visuellen Board (Spalten: Backlog, To Do, In Progress, Review, Done) verwalten, um den Status meiner Arbeit nach dem Jira-/Kanban-Prinzip zu steuern.

## Fachliche Anforderungen (Acceptance Criteria)
1. **Spaltenstruktur:** Fünf feste Spalten: *Backlog*, *To Do*, *In Progress*, *Review*, *Done*.
2. **Statuswechsel:** Tasks lassen sich per Drag-and-Drop oder über Schnellwahl-Buttons in andere Spalten verschieben.
3. **WIP-Limits (Work in Progress):** Optionales Limit für aktive Spalten (z. B. max. 3 Tasks in *In Progress*), um Engpässe sichtbar zu machen.
4. **Persistenz:** Alle Statusänderungen werden direkt an das Backend übertragen und in SQLite gespeichert.
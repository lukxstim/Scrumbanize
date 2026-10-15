# User Story 04: Multi-Project & Workspace Support

## Kontext & Ziel
Als Nutzer möchte ich Notizen, Boards und Aufgaben nach Anwendungsfällen bzw. Projekten (z. B. "Projekt Alpha", "Privat", "Studium") trennen können, sodass jedes Projekt seinen eigenen isolierten Bereich mit eigenen Notizen und einem eigenen Scrumban Board besitzt.

## Fachliche Anforderungen (Acceptance Criteria)
1. **Projekt-Verwaltung:** Erstellen, Bearbeiten, Wechseln und Löschen von Projekten/Workspaces über ein Seitenmenü oder einen Switcher im Header.
2. **Isolierter Kontext:** 
   - Jedes Projekt hat eine eigene Notizen-Übersicht.
   - Jedes Projekt hat ein eigenes Scrumban Board mit eigenen Tasks.
3. **Projektzuordnung bei Konvertierung:** Wird eine Notiz in einen Task umgewandelt, landet dieser automatisch im Backlog des **aktuellen** Projekts.
4. **Standard-Projekt:** Beim ersten Start wird automatisch ein "Default Project" / "Allgemein" angelegt, falls noch kein Projekt existiert.
5. **Persistenz:** Alle Projekte und deren Zugehörigkeiten werden in SQLite gespeichert.
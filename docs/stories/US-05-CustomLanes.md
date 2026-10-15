# User Story 05: Customizable Board Lanes & Columns

## Kontext & Ziel
Als Nutzer möchte ich die Spalten (Columns) und Zeilen/Bahnen (Swimlanes) auf dem Scrumban Board frei anpassen, benennen, umsortieren und skalieren können, um das Board an unterschiedliche Workflows (z. B. Bug-Tracking, Sprints oder Kanban-Pipelines) anzupassen.

## Fachliche Anforderungen (Acceptance Criteria)
1. **Spalten-Anpassung:**
   - Nutzer können Spalten umbenennen, neue Spalten hinzufügen, löschen oder deren Reihenfolge ändern.
   - Für jede Spalte kann individuell ein WIP-Limit (Work in Progress) gesetzt oder entfernt werden.
2. **Swimlanes (Zeilen/Horizontal-Bahnen):**
   - Unterstützung für Swimlanes zur Gruppen-Strukturierung (z. B. nach *Priorität/Expedite*, *Feature/Bug* oder *Teammitglied*).
   - Tasks lassen sich flexibel zwischen Spalten und Swimlanes verschieben.
3. **Skalierbares Layout:** Das Board-Layout passt sich dynamisch an viele Spalten/Lanes an (z. B. über horizontales/vertikales Scrollen oder Zoom-Stufen).
4. **Persistenz pro Projekt:** Die Board-Konfiguration (Spalten, Names, WIP-Limits, Lanes) wird pro Projekt individuell in SQLite gespeichert.
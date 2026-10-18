# US-22: Übergreifende Notizbücher & Globale Wissensdatenbank

## User Story
Als **Power-User**
möchte ich **Notizbücher anlegen können, die nicht fest an ein einzelnes Kanban-Projekt gebunden sind, und Notizen projektübergreifend verknüpfen**,
damit **ich Scrumbanize als zentrale Wissensdatenbank (Personal Knowledge Management) nutzen kann**.

---

## Kontext & Zweck
Notizen sind derzeit fest an einzelne Projekte gekoppelt. Für allgemeine Themen (z. B. Besprechungsprotokolle, Lernnotizen, Vorlagen) fehlen globale Notizbücher. Zudem sollen Tasks aus unterschiedlichen Projekten direkt in Notizen verlinkt werden können.

---

## Akzeptanzkriterien

### 1. Globale Notizbücher & Ordnerstruktur
- [ ] Neuer Hauptbereich "Wissen / Notizbücher" in der Hauptnavigation (neben der Projektauswahl).
- [ ] Erstellung von Notizbüchern mit eigener Farbcodierung und Symbolen (z. B. "Arbeit", "Studium", "Privat").
- [ ] Verschachtelte Ordnerstrukturen innerhalb von Notizbüchern.

### 2. Projektübergreifende Verlinkung
- [ ] Autovervollständigung beim Tippen von `[[` im Markdown-Editor für:
  - Andere Notizen (unabhängig vom Notizbuch).
  - Aufgaben aus allen zugänglichen Projekten (z. B. `[[ProjektA/Task-42]]`).
- [ ] Backlink-Sektion unter Notizen zeigt alle Aufgaben und Notizen an, die auf das aktuelle Dokument verweisen.

### 3. Globale Suche & Tags
- [ ] Die Schnellsuche (Command Palette `Ctrl+K` / `⌘K`) durchsucht alle persönlichen und projektbezogenen Notizbücher gleichzeitig.
- [ ] Globale Tag-Übersicht zum Filtern aller Notizen nach Schlagworten.

---

## Technische Aufgaben
1. **Schema-Anpassung:** Tabelle `notebooks` einführen. Feld `project_id` in `notes` optional machen (`NULL` für globale Notizen).
2. **Editor-Integrität:** Ausbau des Markdown-Parsers für projektübergreifende Link-Syntax.
3. **API & Repositories:** Erweiterung von `notesRepository.ts` um projektunabhängige Abfragen.
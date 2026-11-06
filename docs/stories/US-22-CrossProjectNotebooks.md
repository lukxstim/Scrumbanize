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
- [x] Neuer Hauptbereich "Wissen / Notizbücher" in der Hauptnavigation (neben der Projektauswahl).
- [x] Erstellung von Notizbüchern mit eigener Farbcodierung und Symbolen (z. B. "Arbeit", "Studium", "Privat").
- [x] Verschachtelte Ordnerstrukturen innerhalb von Notizbüchern.

### 2. Projektübergreifende Verlinkung
- [x] Autovervollständigung beim Tippen von `[[` im Markdown-Editor für:
  - Andere Notizen (unabhängig vom Notizbuch).
  - Aufgaben aus allen zugänglichen Projekten (z. B. `[[ProjektA/Task-42]]`).
- [x] Backlink-Sektion unter Notizen zeigt alle Aufgaben und Notizen an, die auf das aktuelle Dokument verweisen.

### 3. Globale Suche & Tags
- [x] Die Schnellsuche (Command Palette `Ctrl+K` / `⌘K`) durchsucht alle persönlichen und projektbezogenen Notizbücher gleichzeitig.
- [x] Globale Tag-Übersicht zum Filtern aller Notizen nach Schlagworten.

---

## Technische Aufgaben
1. **Schema-Anpassung:** Tabelle `notebooks` einführen. Feld `project_id` in `notes` optional machen (`NULL` für globale Notizen).
2. **Editor-Integrität:** Ausbau des Markdown-Parsers für projektübergreifende Link-Syntax.
3. **API & Repositories:** Erweiterung von `notesRepository.ts` um projektunabhängige Abfragen.

Anmerkung: Die globale Tag-Übersicht ist seit US-34 das Menü „Filter“ (alle Tags mit Anzahl, durchsuchbar) statt einer Liste in der Seitenleiste.

# US-19: UI-Refinements & Flexible Layout-Anpassungen

## User Story
Als **Anwender des Scrumbanize-Boards**
möchte ich **die Spaltenbreiten flexibel anpassen können und beim vertikalen Scrollen die Kopfzeilen und Navigation fixiert haben**,
damit **ich das Board optimal an mein Display anpassen kann und den Überblick beim Scrollen durch lange Listen nicht verliere**.

---

## Kontext & Zweck
Bei der täglichen Arbeit mit vielen Aufgaben oder breiten Monitoren stoßen feste Spaltenbreiten an ihre Grenzen. Zudem geht beim Herunterscrollen langer Listen im Board oder auf der Hauptseite die Orientierung verloren, wenn Header und Navigationsleisten mitwegscrollen. Diese Story verbessert die Usability durch flexibles Resizing und intelligentes Sticky-Positioning.

---

## Akzeptanzkriterien

### 1. Flexibles Anpassen der Spaltenbreiten (Board Column Resizing)
- [ ] Spalten im Kanban-Board erhalten ziehbare Trennlinien (Resize-Handles) an den Rändern.
- [ ] Spaltenbreiten lassen sich individuell per Drag-and-Drop anpassen (mit sinnvollen Min- und Max-Breiten, z. B. min. `250px`).
- [ ] Individuell eingestellte Spaltenbreiten werden lokal im Zustand / LocalStorage pro Projekt gespeichert und beim erneuten Laden wiederhergestellt.
- [ ] Option zum Zurücksetzen auf die Standard-Spaltenbreiten ("Spaltenbreiten zurücksetzen" im Board-Menü).

### 2. Fixierte Header & Navigation (Sticky UI & Scrolling)
- [ ] **Sticky Header / Navigation:** Die Hauptnavigationsleiste und der Projekt-Header bleiben beim Herunterscrollen am oberen Bildschirmrand fixiert.
- [ ] **Sticky Board-Kopfzeilen:** Die Spaltenüberschriften (Spaltenname, Task-Anzahl, WIP-Limits, Spalten-Aktionen) bleiben beim vertikalen Scrollen der Tasks oben angedockt.
- [ ] **Unabhängiges Scrollen (Viewports):** Die Hauptseite/das Board nutzt ein sauberes Viewport-Höhenmanagement (`height: 100vh` / flexbox container), sodass Inhaltsbereiche unabhängig scrollen, ohne das Gesamtsystem zu verschieben.

### 3. Allgemeine UI & Drag-and-Drop-Polishing
- [ ] Glattere Scrollbars und fehlerfreies Rendering beim Ziehen von Tasks über unterschiedlich breite Spalten.
- [ ] Saubere responsive Anpassung bei kleineren Bildschirmauflösungen.

---

## Technische Aufgaben
1. **Column Resizer Komponente:** Einfügen von Interactive-Resize-Handles in den Spalten-Headern (`components/board/BoardColumn.tsx`).
2. **Layout & CSS-Klassen:** Anpassen der Layout-Container auf `sticky top-0` bzw. CSS Grid / Flexbox-Höhenbeschränkungen in `ProjectLayout.tsx` und `BoardView.tsx`.
3. **Persistence State:** Speichern der custom Spaltenbreiten (`columnWidths: Record<string, number>`) im UI-Store oder `localStorage`.

---

## Abgrenzung (Out of Scope)
- Komplette Themes / Custom CSS Styling (Dark/Light Mode Anpassungen).
- Neue funktionale Board-Features (reine UI/Layout-Verbesserungen).
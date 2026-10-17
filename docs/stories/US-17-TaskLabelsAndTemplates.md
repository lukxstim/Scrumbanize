# User Story 17: Eigene Task-Labels & Projekt-Templates

## Kontext & Ziel
Als Nutzer möchte ich farbige Labels speziell für Aufgaben definieren sowie Vorlagen für Notizen und Projekte nutzen können, um wiederkehrende Workflows schneller zu starten.

## Fachliche Anforderungen (Acceptance Criteria)
1. **Task-Labels & Tags:**
   - Erstellung und Zuweisung projektweiter, farbiger Task-Labels (z. B. *Bug*, *Feature*, *Einkauf*, *Dringend*).
   - Anzeige der Labels direkt auf den Board-Karten und Filterbarkeit im Board.
2. **Notiz- & Task-Vorlagen (Templates):**
   - Erstellung und Speicherung benutzerdefinierter Vorlagen (z. B. *Meeting-Protokoll*, *Sprint-Planning*, *Bug-Report*).
   - Auswahl der Vorlage beim Anlegen einer neuen Notiz/Aufgabe mit automatischer Textbefüllung.
3. **Persistenz:** Vorlagen und Labels werden in SQLite pro Projekt gespeichert.
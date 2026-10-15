# User Story 09: Kalender-Ansicht, Task-Zeiten & Prioritäten

## Kontext & Ziel
Als Nutzer möchte ich Aufgaben mit Start-/Fälligkeitsdaten, Zeiteinschätzungen und Prioritäten versehen sowie einen eigenen Kalender-Tab nutzen können, um Deadlines und zeitliche Abläufe visuell zu planen.

## Fachliche Anforderungen (Acceptance Criteria)
1. **Task-Metadaten (Zeit & Priorität):**
   - Jede Aufgabe kann ein Fälligkeitsdatum (Due Date), optional einen Startzeitpunkt sowie eine Priorität (z. B. *Niedrig*, *Mittel*, *Hoch*, *Dringend* / P1–P4) erhalten.
   - Prioritäten werden auf den Task-Karten auf dem Board und im Detail-Modal farblich hervorgehoben.
2. **Kalender-Tab:**
   - Ein neuer, top-level Tab „Kalender“ (Monats- und Wochenansicht) zeigt alle Aufgaben basierend auf ihren Fälligkeitsdaten.
   - Per Drag-and-Drop oder Klick lassen sich Termine/Deadlines direkt im Kalender anpassen.
3. **Filter & Sortierung:**
   - Das Board und die Aufgaben-Listen lassen sich nach Priorität und Fälligkeit sortieren bzw. filtern.
4. **Persistenz:**
   - Alle Prioritäten und Zeitstempel werden projektspezifisch in SQLite gespeichert und in der Desktop- sowie Web-App synchron gehalten.
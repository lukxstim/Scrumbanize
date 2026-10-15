# User Story 13: First-Start Onboarding & Sample Project

## Kontext & Ziel
Als neuer Nutzer möchte ich beim ersten Start der Anwendung eine kurze interaktive Führung und eine Beispiel-Notiz erhalten, wobei ich die Tour jederzeit überspringen oder dauerhaft deaktivieren kann („Nicht erneut anzeigen“).

## Fachliche Anforderungen (Acceptance Criteria)
1. **Beispiel-Projekt (Sample Data):**
   - Beim allerersten Start erstellt das System automatisch ein Projekt „Willkommen bei Scrumbanize“ mit einer strukturierten Beispiel-Notiz und vorgefertigten Tasks auf dem Board.
2. **Onboarding-Tour & Skip-Optionen:**
   - Ein kurzer, dezent eingeblendeter Quick-Start-Guide führt durch die wichtigsten Funktionen.
   - Jedes Tour-Fenster bietet einen **„Überspringen“**-Button (beendet die Tour sofort) sowie eine Checkbox oder Option **„Nicht erneut anzeigen“**.
   - Die Auswahl wird dauerhaft im `localStorage` des Browsers gespeichert, sodass die Tour nie wieder aufpoppt, wenn sie einmal beendet oder übersprungen wurde.
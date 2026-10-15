# User Story 08: Desktop Packaging & Distribution (.exe)

## Kontext & Ziel
Als Nutzer möchte ich "scrumbanize" als eigenständige Windows-Desktop-Anwendung (`.exe`) verpacken können, um sie problemlos mit anderen Personen (z. B. Familienmitgliedern) zu teilen, ohne dass auf deren Geräten Node.js vorinstalliert sein muss.

## Fachliche Anforderungen (Acceptance Criteria)
1. **Electron-Hülle (Desktop Wrapper):**
   - Ein Electron-Hauptprozess startet das Express-Backend lokal im Hintergrund und lädt das gebaute React-Frontend in ein Anwendungsfenster.
2. **Sichere SQLite-Speicherung:**
   - Die SQLite-Datenbankdatei (`sqlite.db`) wird dynamisch im systemweiten Benutzer-Datenverzeichnis des Betriebssystems (`app.getPath('userData')`) gespeichert, um Schreibfehler und Rechteprobleme zu verhindern.
3. **Build & Packaging (`electron-builder`):**
   - Konfiguration von `electron-builder`, um mit einem Befehl eine portable oder installierbare Windows-`.exe` zu generieren.
   - Alle Produktions-Assets (Frontend-Build, Server-Skripte und Node-Module) werden korrekt gebündelt.
4. **Lifecycle-Management:**
   - Das Express-Backend wird beim Schließen der App sauber heruntergefahren, und Prozesse hängen nicht im Hintergrund fest.
5. **Entwicklungs-Modus intakt:**
   - Die bestehende Browser-Entwicklung (`npm run dev`) funktioniert weiterhin uneingeschränkt.
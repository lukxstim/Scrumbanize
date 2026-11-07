# Automatisches Backup auf einem Mac

Lädt jeden Tag den persönlichen Export eines Scrumbanize-Kontos herunter – dasselbe wie **Einstellungen → „Meine Daten exportieren“**:

- alle Notizbücher, die die Person sehen kann, jede Notiz als Markdown-Datei mit ihren Anhängen,
- die Aufgaben jedes Boards als CSV-Datei,
- alle Termine als `Kalender.ics`.

Jeder Tag ergibt eine Datei `scrumbanize-export-JJJJ-MM-TT.zip`; die neuesten (Standard: 30) bleiben. Ein normales Konto genügt, Administratorrechte braucht es nicht. Das Passwort liegt im Schlüsselbund des Macs, nicht in einer Datei.

## Einrichten

1. Den Ordner `mac-backup` (mit `install.sh` und `backup.sh`) auf den Mac kopieren, z. B. per AirDrop oder USB-Stick in den Ordner „Downloads“.
2. Das Programm **Terminal** öffnen (Spotlight: `⌘` + `Leertaste`, „Terminal“ tippen).
3. Eintippen und mit Enter bestätigen:
   ```sh
   bash ~/Downloads/mac-backup/install.sh
   ```
4. Die Fragen beantworten – meist reicht Enter für den Vorschlag:
   - Adresse der Web-Version (Vorschlag: `https://scrumbanize.onrender.com`)
   - E-Mail und Passwort des Scrumbanize-Kontos (das Passwort wird beim Tippen nicht angezeigt)
   - Ordner für die Backups (Vorschlag: `~/Scrumbanize-Backups`, also „Scrumbanize-Backups“ im Benutzerordner)
   - wie viele Tage aufheben (30) und um wie viel Uhr (20 Uhr)
5. Das Skript lädt sofort das erste Backup herunter und sagt, wo es liegt.

Danach läuft alles von selbst. Schläft der Mac zur eingestellten Uhrzeit, holt er das Backup beim Aufwachen nach; ist er ausgeschaltet, fällt der Tag aus.

## Gut zu wissen

- **Fehler** meldet der Mac mit einer Mitteilung „Scrumbanize-Backup fehlgeschlagen“, z. B. nach einer Passwortänderung. Dann `install.sh` noch einmal ausführen.
- **Protokoll:** `~/Library/Logs/Scrumbanize-Backup.log` (im Finder `⇧` + `⌘` + `G`, den Pfad eintippen).
- **Sofort ein Backup:** `bash ~/Library/Application\ Support/Scrumbanize-Backup/backup.sh`
- **Ordner:** Am besten im Benutzerordner lassen. Ordner wie „Dokumente“, „Schreibtisch“ oder iCloud Drive schützt macOS vor Programmen im Hintergrund; dort kann das Speichern scheitern.
- **Ändern:** `install.sh` einfach noch einmal ausführen.
- **Entfernen:** `bash ~/Downloads/mac-backup/install.sh --remove` – die bisherigen Backups bleiben liegen.
- **Wiederherstellen:** Die ZIP-Datei entpacken. Notizen lassen sich in Scrumbanize unter Einstellungen → „Notizen importieren“ wieder einlesen (den Ordner eines Notizbuchs auswählen), die `Kalender.ics` in jede Kalender-App importieren.

Für Windows gibt es dasselbe unter [`../windows-backup`](../windows-backup/README.md).

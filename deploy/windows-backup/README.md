# Automatisches Backup auf einem Windows-PC

Lädt jeden Tag den persönlichen Export eines Scrumbanize-Kontos herunter – dasselbe wie **Einstellungen → „Meine Daten exportieren“**:

- alle Notizbücher, die die Person sehen kann, jede Notiz als Markdown-Datei mit ihren Anhängen,
- die Aufgaben jedes Boards als CSV-Datei,
- alle Termine als `Kalender.ics`.

Jeder Tag ergibt eine Datei `scrumbanize-export-JJJJ-MM-TT.zip`; die neuesten (Standard: 30) bleiben. Ein normales Konto genügt, Administratorrechte braucht es nicht – weder in Scrumbanize noch in Windows. Das Passwort wird mit Windows verschlüsselt gespeichert und lässt sich nur mit diesem Windows-Konto auf diesem PC lesen.

Für den Mac gibt es dasselbe unter [`../mac-backup`](../mac-backup/README.md).

## Einrichten

1. Den Ordner `windows-backup` (mit `install.cmd`, `install.ps1` und `backup.ps1`) auf den PC kopieren, z. B. nach „Downloads“.
2. **`install.cmd` doppelklicken.** Fragt Windows „Der Computer wurde durch Windows geschützt“: „Weitere Informationen“ → „Trotzdem ausführen“.
3. Die Fragen beantworten – meist reicht Enter für den Vorschlag:
   - Adresse der Web-Version (Vorschlag: `https://scrumbanize.onrender.com`)
   - E-Mail und Passwort des Scrumbanize-Kontos (das Passwort wird beim Tippen nicht angezeigt)
   - Ordner für die Backups (Vorschlag: „Scrumbanize-Backups“ im Benutzerordner)
   - wie viele Tage aufheben (30) und um wie viel Uhr (20 Uhr)
4. Das Fenster lädt sofort das erste Backup herunter und sagt, wo es liegt.

Danach läuft alles von selbst über die **Aufgabenplanung** (Aufgabe „Scrumbanize-Backup“). War der PC zur eingestellten Uhrzeit aus oder im Standby, holt er das Backup beim nächsten Einschalten nach.

## Gut zu wissen

- **Fehler** meldet Windows mit einem Hinweis neben der Uhr „Scrumbanize-Backup fehlgeschlagen“, z. B. nach einer Passwortänderung. Dann `install.cmd` noch einmal ausführen.
- **Protokoll:** `%APPDATA%\Scrumbanize-Backup\backup.log` (in die Adresszeile des Explorers eintippen).
- **Sofort ein Backup:** In der Aufgabenplanung die Aufgabe „Scrumbanize-Backup“ auswählen → „Ausführen“.
- **Ändern:** `install.cmd` einfach noch einmal ausführen.
- **Entfernen:** In einem Terminal im Ordner `windows-backup`: `powershell -ExecutionPolicy Bypass -File install.ps1 -Remove` – die bisherigen Backups bleiben liegen.
- **Wiederherstellen:** Die ZIP-Datei entpacken. Notizen lassen sich in Scrumbanize unter Einstellungen → „Notizen importieren“ wieder einlesen (den Ordner eines Notizbuchs auswählen), die `Kalender.ics` in Outlook oder jede andere Kalender-App importieren.

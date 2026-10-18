# Scrumbanize 1.1.0

## Überblick

Scrumbanize gibt es jetzt auch **für den Mac**: eine App für Macs mit Apple-Chip und mit Intel-Prozessor, neben der bekannten Windows-Version. Dazu kommen **Statistiken** zu deinen Projekten, ein **Graph** und **Mindmaps** für Notizen, **Backup und Wiederherstellung** mit einem Klick, **Labels und Vorlagen**, **Erinnerungen an fällige Aufgaben** und ein Board, dessen **Spalten du selbst breiter oder schmaler** machen kannst.

Deine Daten bleiben beim Update erhalten. Die Datenbank wird beim ersten Start automatisch auf den neuen Stand gebracht.

## Neue Features und Highlights

### Für Windows und macOS

- **Neu: Scrumbanize für den Mac** – als `.dmg` (und `.zip`) für macOS 12 oder neuer. Es ist eine einzige Universal-App für Apple-Chip (M1, M2 …) und Intel, du kannst also nicht die falsche Datei erwischen.
- Auf dem Mac verhält sich Scrumbanize wie ein Mac-Programm: Menüleiste mit „Bearbeiten“ (`⌘C`, `⌘V` usw. in allen Textfeldern), Schließen des Fensters lässt die App im Dock und in der Menüleiste weiterlaufen, `⌘Q` beendet sie. Tastenkürzel zeigen `⌘`, `⇧`, `⌥` statt Strg und Umschalt.
- Für Windows gibt es weiterhin den Installer (`Scrumbanize-Setup-1.1.0.exe`) und die portable Version (`Scrumbanize-1.1.0-portable.exe`).

### Erinnerungen, Infobereich und Tastenkombination (Desktop-App)

- **Erinnerungen an fällige Aufgaben:** Ist eine Aufgabe heute fällig oder überfällig, meldet sich Scrumbanize mit einer Benachrichtigung von Windows bzw. einer Mitteilung auf dem Mac – einmal am Tag, bis die Aufgabe in der letzten Spalte liegt. Ein Klick öffnet die Aufgabe; bei mehr als drei Aufgaben kommt eine Sammelmeldung, die den Kalender öffnet.
- **Symbol neben der Uhr (Windows) bzw. in der Menüleiste (Mac):** holt Scrumbanize nach vorne, prüft auf Wunsch sofort die Erinnerungen oder beendet die App.
- **Im Infobereich weiterlaufen (Windows):** Auf Wunsch schließt bzw. minimiert sich Scrumbanize nicht mehr, sondern läuft neben der Uhr weiter. Beides ist voreingestellt aus, damit das Schließen-Kreuz weiter wie gewohnt beendet.
- **Tastenkombination:** `Strg` + `Umschalt` + `Leertaste` (Mac: `⌘` + `⇧` + `Leertaste`) holt Scrumbanize von überall nach vorne. Sie lässt sich in den Einstellungen ändern; ist eine Kombination schon von einem anderen Programm belegt, sagt Scrumbanize Bescheid.
- **Beim Anmelden starten:** Scrumbanize startet mit Windows (ohne Fenster, im Infobereich) bzw. bei der Anmeldung am Mac, damit Erinnerungen auch kommen, wenn du es nicht geöffnet hast.
- Alles einstellbar unter **Einstellungen → Desktop-App**.

### Statistiken

- Neuer Bereich **„Statistiken“** für jedes Projekt, für die letzten 4 Wochen bis 12 Monate oder einen eigenen Zeitraum, nach Wochen oder Monaten:
  - **Velocity:** erledigte und neu angelegte Aufgaben pro Woche bzw. Monat.
  - **Lead Time** (vom Anlegen bis „Erledigt“) und **Cycle Time** (vom Arbeitsbeginn bis „Erledigt“), jeweils Median und 85-%-Wert.
  - **WIP-Überschreitungen:** wann und wie lange in einer Spalte mehr Aufgaben lagen, als ihr Limit erlaubt.
- Jedes Diagramm gibt es auch als Tabelle. Gerechnet wird aus dem Board und dem Verlauf; für Zeiträume ohne Verlauf zeigt Scrumbanize „Keine Daten“, statt zu schätzen.

### Graph und Mindmap

- **Graph:** Unter „Notizen“ → „Graph“ siehst du alle Notizen und Aufgaben eines Projekts als Netzwerk – welche Aufgabe aus welcher Notiz stammt und welche Aufgaben sich gegenseitig blockieren. Mit Suche, Filtern (Notizen, Aufgaben, Erledigte, ohne Verbindung) und Sprung zur Notiz oder Aufgabe per Klick. Auch große Projekte bleiben flüssig (getestet mit 2.000 Einträgen).
- **Mindmap:** „Als Mindmap“ im Editor zeigt die Überschriften, Listen und Checklisten einer Notiz als Mindmap. Zweige lassen sich auf- und zuklappen; Export als **SVG** oder **PNG**.

### Einstellungen: Sichern, Wiederherstellen, Importieren, Exportieren

- Neue **Einstellungen** über das Zahnrad oben rechts.
- **Backup mit einem Klick:** eine ZIP-Datei mit allen Projekten, Notizen, Aufgaben, dem Verlauf und allen Anhängen – auch während der Arbeit.
- **Wiederherstellen:** Scrumbanize prüft das Backup zuerst und zeigt, was es enthält. Vor dem Ersetzen sichert es automatisch den jetzigen Stand (die letzten fünf Sicherungen bleiben). Backups älterer Versionen lassen sich ebenfalls einspielen.
- **Notizen importieren** aus Markdown-Dateien, ganzen Ordnern (z. B. Obsidian) oder ZIP-Exporten (z. B. Notion): Titel, Tags und Erstelldatum werden übernommen.
- **Exportieren:** einzelne Notizen als Markdown oder druckfertiges HTML, alle Notizen eines Projekts als ZIP (mit Anhängen), das Board als CSV-Datei für Excel.

### Labels und Vorlagen

- **Farbige Labels** für Aufgaben – neue Projekte starten mit *Bug*, *Feature* und *Dringend*. Sie erscheinen auf den Karten, im Kalender und im Graph, und das Board lässt sich danach filtern. Verwalten über „Labels“ über dem Board.
- **Vorlagen für Notizen und Aufgaben**, für ein Projekt oder für alle. Mitgeliefert: *Meeting-Protokoll*, *Sprint-Planning* und *Bug-Report*.
- **Platzhalter** wie `{{datum}}`, `{{wochentag}}`, `{{uhrzeit}}`, `{{kw}}` und `{{projekt}}` werden beim Anlegen ausgefüllt. Aufgaben-Vorlagen setzen auch Priorität, Labels, Spalte, Swimlane und eine Fälligkeit (z. B. „in 7 Tagen“).
- Vorlagen auswählen beim Anlegen oder über die Befehlspalette (`Strg` + `K`), verwalten in den Einstellungen oder mit „Als Vorlage speichern“.

## UI/UX- und Performance-Verbesserungen

- **Verstellbare Spaltenbreiten:** am rechten Rand einer Spaltenüberschrift ziehen (200 bis 600 Pixel), Doppelklick setzt zurück; per Tastatur ebenso. Die Breiten werden gespeichert, gelten auf allen Geräten und sind im Backup enthalten.
- **Neues Menü „⋯“ über dem Board** mit „An Fenster anpassen“ (alle Spalten so breit, dass das Board ins Fenster passt), „Spaltenbreiten zurücksetzen“ und dem CSV-Export. Jede Spalte kann einzeln zurückgesetzt werden.
- **Überschriften bleiben stehen:** Beim Scrollen durch lange Spalten bleiben die Spaltenüberschriften und die Namen der Swimlanes oben sichtbar.
- **Eigene Scrollbereiche:** Board, Notizen und die übrigen Seiten scrollen jeweils für sich; Kopfzeile und Navigation bleiben immer stehen. Eine einzelne Swimlane reicht jetzt bis zum unteren Fensterrand.
- **Kopfzeile für kleinere Fenster und Tablets:** Sie wird stufenweise kompakter (Symbole statt Beschriftung, Suche als Lupe) und ragt nicht mehr aus dem Fenster – vorher passierte das zwischen etwa 1024 und 1300 Pixel Breite, auch in der Desktop-App.
- **Ziehen per Tastatur** springt auch bei unterschiedlich breiten Spalten genau in die Nachbarspalte.
- Schmale Scrollbalken in den Farben des hellen bzw. dunklen Modus.
- Das Zahnrad der Einstellungen hat Zähne bekommen und ist nicht mehr mit der Sonne des Farbmodus-Schalters zu verwechseln.

## Hinter den Kulissen

- Neue Versionen werden jetzt automatisch gebaut: Ein Versions-Tag startet auf GitHub die Tests, baut die Windows- und die Mac-App, startet beide einmal zur Probe und legt einen Release-Entwurf mit allen Dateien an.
- Jede Änderung am Hauptzweig wird automatisch getestet.

## Installation und Systemanforderungen

| | Windows | Mac |
|---|---|---|
| **System** | Windows 10 oder 11, 64 Bit | macOS 12 (Monterey) oder neuer, Apple-Chip oder Intel |
| **Datei** | `Scrumbanize-Setup-1.1.0.exe` (Installer) oder `Scrumbanize-1.1.0-portable.exe` | `Scrumbanize-1.1.0-universal.dmg` (alternativ `.zip`) |
| **Installieren** | Datei ausführen – ohne Administrator-Passwort | `.dmg` öffnen und Scrumbanize auf den Ordner „Programme“ ziehen |
| **Daten** | `%APPDATA%\Scrumbanize` | `~/Library/Application Support/Scrumbanize` |

**Update von 1.0.0:** Unter Windows einfach den neuen Installer ausführen. Notizen, Aufgaben und Einstellungen bleiben erhalten.

**Windows-SmartScreen:** Beim ersten Start kann „Der Computer wurde durch Windows geschützt“ erscheinen. Auf **„Weitere Informationen“** und dann **„Trotzdem ausführen“** klicken.

**Hinweis für den Mac (Gatekeeper):** Scrumbanize ist kostenlos und nicht bei Apple registriert. Der Mac fragt deshalb beim ersten Start einmal nach:

- **macOS 15 (Sequoia) und neuer:** Scrumbanize öffnen, die Meldung mit „Fertig“ schließen, dann Apple-Menü → **Systemeinstellungen** → **Datenschutz & Sicherheit** → ganz unten **„Dennoch öffnen“** klicken und mit dem Mac-Passwort bestätigen.
- **macOS 14 (Sonoma) und älter:** Scrumbanize im Ordner „Programme“ mit gedrückter `ctrl`-Taste anklicken (oder Rechtsklick), **„Öffnen“** wählen und noch einmal **„Öffnen“** bestätigen.

Danach startet Scrumbanize ganz normal. Bei der ersten Erinnerung fragt der Mac außerdem, ob Scrumbanize **Mitteilungen** senden darf – dafür auf „Erlauben“ klicken.

**Benachrichtigungen unter Windows:** Sie sind mit dem Installer zuverlässig; mit der portablen Version kommen sie nicht immer an.

Die ausführliche Schritt-für-Schritt-Anleitung steht in der [README](README.md#anleitung-für-die-installation).

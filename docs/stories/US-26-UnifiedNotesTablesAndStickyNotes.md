# US-26: Einheitliche Notizen, Tabellen & Sticky Notes (Kurznotizen)

## User Story
Als **Benutzer**
möchte ich **Notizen und Projekte in einer einheitlichen Notizbuch-Struktur verwalten, Tabellen einfügen und Schnellnotizen als Windows-Sticky-Notes anheften können**,
damit **ich Text-Dokumente, Tabellen und schnelle Gedanken an einem Ort habe, ohne zwischen „Projekte“ und „Wissen“ unterscheiden zu müssen**.

---

## Kontext & Zweck
Notizen liegen derzeit getrennt in den Bereichen „Projekte“ und „Wissen“. Nach dem OneNote-Prinzip sollen sie in einer zentralen Struktur zusammengeführt werden. Zusätzlich fehlen Tabellen im Editor und eine Möglichkeit, kurze Gedanken schnell am Desktop festzuhalten.

---

## Akzeptanzkriterien

### 1. Einheitliche Notizstruktur
- [x] Die getrennten Bereiche „Projekte“ und „Wissen“ werden zu einer zentralen Struktur („Notizen“) zusammengeführt (OneNote-Prinzip).

### 2. Tabellen & Editor
- [x] Innerhalb von Notizen können native Tabellen erstellt, editiert und formatiert werden.
- [x] Die Formatierungsleiste (Rich-Text-Toolbar) bleibt beim Herunterscrollen in Notizen immer oben sichtbar (Sticky Header).

### 3. Sticky Notes
- [x] Notizen lassen sich als kompaktes, schwebendes Fenster („Sticky Note“) auskoppeln und am Desktop anpinnen.
- [x] **Kurznotizen** wie die Windows Sticky Notes (nach Vorlage-Screenshot `docs/screenshots/sticky-notes.png`): eine Leiste mit „+ Notiz“, „Aktuelle Notizen“ mit Suche und farbigen Karten (Farbbalken, Datum, erste Zeile fett als Titel, Listen als Punkte), neueste zuerst; ein Klick bearbeitet die Karte an Ort und Stelle, alles speichert sich selbst.
- [x] Die Kurznotizen sind Notizen im Notizbuch „Kurznotizen“, das beim ersten Mal entsteht – durchsuchbar, verlinkbar, im Backup; Löschen legt sie in den Papierkorb.
- [x] Desktop-App: ein rahmenloses Fenster, immer im Vordergrund, rechts am Bildschirmrand über die volle Höhe angedockt; die Breite lässt sich ziehen und bleibt gespeichert; beim Beenden geöffnet, ist es beim nächsten Start wieder da. Öffnen über den Button im Header, das Tray-Menü oder die Befehlspalette.
- [x] Chrome/Edge: dieselbe Leiste als Document-Picture-in-Picture-Fenster; in anderen Browsern gibt es den Button nicht.

---

## Entscheidungen (Klärung, 04.11.2026)
1. **Zusammenführung:** Ein Bereich „Notizen“ statt des Umschalters Projekte/Wissen, mit einer gemeinsamen Seitenleiste für alle Notizbücher. Ein Projekt ist ein Notizbuch mit eingeschaltetem Board; Board, Kalender und Statistiken erscheinen nur dort. Das Board lässt sich je Notizbuch ein- und ausschalten.
2. **Board ausschalten:** Die Aufgaben bleiben unverändert erhalten und werden nur ausgeblendet; beim Wiedereinschalten sind sie mit ihrem Status zurück. Vorher ein Hinweis mit der Anzahl („Dieses Board hat 12 Aufgaben; sie werden ausgeblendet, nicht gelöscht.“).
3. **Sticky Notes:** In der Desktop-App ein echtes rahmenloses Fenster, immer im Vordergrund, Position wird gespeichert. Im Browser über Document Picture-in-Picture (Chrome/Edge); ohne diese Funktion wird der Button ausgeblendet.
4. **Kurznotizen statt ausgekoppelter Notizen** (Rückmeldung nach dem ersten Entwurf): nicht eine bestehende Notiz als Fenster, sondern eine Leiste für schnelle Kleinigkeiten, rechts angedockt wie die Windows Sticky Notes.

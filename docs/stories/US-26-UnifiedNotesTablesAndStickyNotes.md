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
- [x] Desktop-App: rahmenloses Fenster, immer im Vordergrund, verschiebbar über die Titelleiste; Position und Größe je Notiz werden gespeichert, beim Beenden offene Sticky Notes öffnen sich beim nächsten Start wieder.
- [x] Chrome/Edge: Document Picture-in-Picture (ein Fenster je Tab); in anderen Browsern gibt es den Button nicht.
- [x] Gelbes Papier wie Windows Sticky Notes (auch im dunklen Theme), Titel in der Leiste, Text ohne Werkzeugleiste (Tastenkürzel und Markdown-Eingabe); speichert selbst, übernimmt Änderungen von woanders.

---

## Entscheidungen (Klärung, 04.11.2026)
1. **Zusammenführung:** Ein Bereich „Notizen“ statt des Umschalters Projekte/Wissen, mit einer gemeinsamen Seitenleiste für alle Notizbücher. Ein Projekt ist ein Notizbuch mit eingeschaltetem Board; Board, Kalender und Statistiken erscheinen nur dort. Das Board lässt sich je Notizbuch ein- und ausschalten.
2. **Board ausschalten:** Die Aufgaben bleiben unverändert erhalten und werden nur ausgeblendet; beim Wiedereinschalten sind sie mit ihrem Status zurück. Vorher ein Hinweis mit der Anzahl („Dieses Board hat 12 Aufgaben; sie werden ausgeblendet, nicht gelöscht.“).
3. **Sticky Notes:** In der Desktop-App ein echtes rahmenloses Fenster, immer im Vordergrund, Position wird gespeichert. Im Browser über Document Picture-in-Picture (Chrome/Edge); ohne diese Funktion wird der Button ausgeblendet.

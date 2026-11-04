# US-34: Notizbuch-Baum & wählbare Notizansicht

## User Story
Als **Benutzer**
möchte ich **meine Notizen wie in OneNote als Baum aus Notizbüchern, Ordnern und Seiten sehen und selbst wählen können, wie die Notizen dargestellt werden**,
damit **ich mich schnell zurechtfinde und nicht von Listen und Tags abgelenkt werde, die ich gerade nicht brauche**.

---

## Kontext & Zweck
Seit US-26 liegen alle Notizen in Notizbüchern. Die Ansicht hat aber drei Spalten: eine Seitenleiste mit Notizbüchern und allen Tags, eine Liste mit Suche, Tag-Chips und Ordnern, und den Editor. Tags erscheinen dadurch doppelt, und der Weg zu einer Seite ist lang. OneNote zeigt dagegen jedes Notizbuch mit Symbol und Namen, darunter direkt seine Seiten. Das Modell „Notizbuch → Ordner → Notiz“ passt dazu eins zu eins.

---

## Akzeptanzkriterien

### 1. Baumansicht (Standard)
- [x] Links steht ein Baum: jedes Notizbuch mit Symbol (oder Farbpunkt) und Namen, aufklappbar; darunter seine Ordner und Notizen (Seiten), nur mit Titel.
- [x] Daneben nur der Editor – keine mittlere Listenspalte.
- [x] Aufgeklappte Notizbücher und Ordner merkt sich der Browser.
- [ ] Notizen und Ordner lassen sich im Baum per Drag & Drop verschieben, auch in ein anderes Notizbuch.
- [ ] Über „⋯“ am Notizbuch: Neue Seite, Neuer Ordner, Sortierung (Name, zuletzt geändert, erstellt), Bearbeiten, Mitglieder.
- [ ] Notizbücher mit Board zeigen ein kleines Board-Symbol, ein Klick darauf öffnet das Board.

### 2. Wählbare Darstellung
- [x] Ein Umschalter oben im Baum (und in den Einstellungen) wählt die Darstellung: **Baum** (nur Titel) oder **Liste** (Titel mit Textanfang, Datum und Tags, wie bisher).
- [x] Ebenfalls wählbar: Tags an der Notiz anzeigen oder ausblenden.
- [ ] „Verlinkt von“ unter der Notiz aufgeklappt oder eingeklappt.
- [ ] Die Wahl gilt je Person und bleibt nach dem Neuladen erhalten.

### 3. Tags auf Wunsch
- [x] Standardmäßig keine Tag-Liste in der Seitenleiste und keine Tag-Chips über der Liste.
- [x] Ein Knopf „Filter“ öffnet ein Menü mit allen Tags (mit Anzahl, durchsuchbar) zum An- und Abhaken.
- [x] Ein aktiver Filter erscheint als kleiner Chip mit ✕; der Baum zeigt dann nur passende Seiten (und ihre Ordner).

### 4. Suche und „Alle Notizen“
- [ ] Ein Suchfeld oben im Baum durchsucht alle Notizbücher; Treffer erscheinen als flache Liste mit Notizbuch-Namen.
- [ ] „Alle Notizen“ ist kein eigener Ort mehr; `/wissen` und `/wissen/notizen/:id` leiten auf die Notiz in ihrem Notizbuch bzw. auf die Suche weiter.

### 5. Seiten verbinden
- [ ] Eine Seite aus dem Baum in den Editor einer anderen Notiz ziehen fügt dort einen Link (`note:`) ein.
- [x] `[[`-Links und „Verlinkt von“ bleiben wie bisher.

### 6. Handy
- [x] Auf schmalen Bildschirmen ist der Baum die erste Ansicht; ein Tipp auf eine Seite öffnet den Editor, „Zurück“ führt zum Baum.

---

## Entscheidungen (Klärung, 04.11.2026)
1. Die Baumansicht ist Standard, die bisherige Liste mit Vorschau bleibt als wählbare Darstellung erhalten.
2. Tags werden nicht entfernt, nur standardmäßig ausgeblendet und über ein Filtermenü erreichbar.
3. Umsetzung vor US-26c (Sticky Notes), damit „Seite als Sticky Note öffnen“ im Baum-Menü landen kann.

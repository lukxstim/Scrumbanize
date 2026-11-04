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

### 1. Notizbuch-Ansicht wie OneNote (Standard, drei Spalten)
- [x] Links: jedes Notizbuch mit Symbol (oder Farbpunkt) und Namen; unter dem offenen seine **Abschnitte** (= Ordner) mit Farbbalken, Unterabschnitte eingerückt, „Ohne Abschnitt“ für Seiten ohne Ordner und „+ Neuer Abschnitt“.
- [x] Mitte: nur die **Seiten** des gewählten Abschnitts als Titel, darüber „Seite hinzufügen“ (mit Vorlagen) und Sortieren (zuletzt geändert, zuletzt erstellt, nach Titel; merkt sich der Browser).
- [x] Rechts: die Seite im Editor. Ein Klick auf einen Abschnitt öffnet seine erste Seite.
- [x] „⋯“ am Abschnitt: Neue Seite hier, Neuer Unterabschnitt, Umbenennen (auch Doppelklick), Verschieben nach …, Löschen.
- [x] Seiten lassen sich per Drag & Drop auf einen Abschnitt verschieben.
- [x] Seiten in einen Abschnitt eines anderen Notizbuchs ziehen (oder auf das Notizbuch selbst: „Ohne Abschnitt“); mit Anhängen, Tags und Links. Dafür braucht man im Ziel die Rolle „Mitglied“.
- [ ] Abschnitte per Drag & Drop umsortieren.
- [x] Mehrere Notizbücher gleichzeitig aufklappen (merkt sich der Browser); ein Klick auf einen Abschnitt eines anderen Notizbuchs öffnet dessen erste Seite.
- [ ] Ein Klick auf das Board-Symbol eines Notizbuchs öffnet das Board.

### 2. Wählbare Darstellung
- [x] In den Einstellungen (Zahnrad oben rechts, Abschnitt „Notizen“) wählt man die Darstellung: **Notizbuch** (wie OneNote) oder **Liste** (Titel mit Textanfang, Datum und Tags, wie bisher).
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
1. Die Notizbuch-Ansicht (drei Spalten wie OneNote, nach Vorlage-Screenshot) ist Standard, die bisherige Liste mit Vorschau bleibt als wählbare Darstellung erhalten.
2. Tags werden nicht entfernt, nur standardmäßig ausgeblendet und über ein Filtermenü erreichbar.
3. Umsetzung vor US-26c (Sticky Notes), damit „Seite als Sticky Note öffnen“ im Baum-Menü landen kann.

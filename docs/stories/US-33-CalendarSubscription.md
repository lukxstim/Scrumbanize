# US-33: Kalender-Abonnement (iCal / ICS Feed)

## User Story
Als **Benutzer**
möchte ich **einen persönlichen Kalender-Abo-Link (iCal/ICS Feed) in den Einstellungen generieren können**,
damit **meine Fälligkeiten und Termine aus Scrumbanize automatisch in meinem externen Kalender (Outlook, Google Calendar, Apple Calendar) angezeigt werden**.

---

## Kontext & Zweck
Termine aus Scrumbanize sind bisher nur im eigenen Kalender der App sichtbar. Ein Abo-Link bringt sie ohne manuellen Export in gängige Kalender-Apps.

---

## Akzeptanzkriterien

### 1. Abo-Link
- [x] In den Benutzer-Einstellungen gibt es eine Option „Kalender abonnieren“.
- [x] Die App generiert einen eindeutigen, geschützten iCal-Link (z. B. `https://scrumbanize.onrender.com/api/calendar/feed/<secret-token>.ics`).

### 2. Feed
- [x] Der Server stellt unter dieser URL alle Aufgaben mit Fälligkeits-/Startdatum im Standard-`iCalendar` (`.ics`)-Format bereit.

### 3. Sicherheit
- [x] Der Token kann bei Bedarf vom Nutzer neu generiert/widerrufen werden.

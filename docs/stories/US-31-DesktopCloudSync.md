# US-31: Automatische Cloud-Synchronisation für die Desktop-App

## User Story
Als **Benutzer der Desktop-Anwendung**
möchte ich, **dass meine Daten immer automatisch mit dem Online-Server synchronisiert werden**,
damit **alle Notizen und Boards geräteübergreifend auf dem gleichen Stand sind und der Speicherort transparent ist**.

---

## Kontext & Zweck
Die Desktop-App speichert ihre Daten bisher lokal, während die Web-Version auf Render läuft. Beide sollen denselben Datenstand nutzen.

---

## Akzeptanzkriterien

### 1. Online-Verbindung & Synchronisation
- [ ] Die Desktop-Version baut automatisch eine Online-Verbindung zur PostgreSQL-Datenbank (Render) auf.
- [ ] Alle Änderungen werden nahtlos in der Cloud gespeichert und synchronisiert.

### 2. Transparenz
- [ ] In den Einstellungen wird der Speicherort / Verbindungsstatus klar angezeigt.

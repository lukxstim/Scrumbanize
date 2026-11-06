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
- [x] Die Desktop-Version baut automatisch eine Online-Verbindung zum Server (Render) auf, sobald er in den Einstellungen eingetragen ist.
- [x] Alle Änderungen werden nahtlos in der Cloud gespeichert und synchronisiert.

### 2. Transparenz
- [x] In den Einstellungen wird der Speicherort / Verbindungsstatus klar angezeigt.

---

## Umsetzung
Statt die Desktop-App direkt an eine Datenbank zu hängen und zwei Datenbestände abzugleichen, arbeitet sie auf Wunsch **mit dem Online-Server selbst**: Einstellungen → Desktop-App → Speicherort → Adresse eintragen und „Verbinden“. Das Fenster zeigt dann das Scrumbanize des Servers (mit dessen Anmeldung); Erinnerungen, Kurznotizen und Infobereich laufen weiter. So gibt es nur einen Datenstand und keine Konflikte. Die Daten auf dem Computer bleiben erhalten und werden nicht übertragen (dafür Backup und Wiederherstellen). Ist der Server beim Start nicht erreichbar, fragt die App, ob sie es erneut versucht oder bis zum nächsten Start mit den Daten auf diesem Computer arbeitet. Ohne Internet gibt es im Server-Modus also keinen Offline-Betrieb.

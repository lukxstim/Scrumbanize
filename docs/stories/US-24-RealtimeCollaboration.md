# US-24: Echtzeit-Zusammenarbeit (WebSockets & Live-Updates)

## User Story
Als **Teammitglied**
möchte ich **Änderungen von Kolleginnen und Kollegen auf dem Kanban-Board und in Notizen sofort ohne manuelles Neuladen sehen**,
damit **wir ohne Überschneidungen synchron zusammenarbeiten können**.

---

## Kontext & Zweck
Sobald mehrere Nutzer gleichzeitig über den Browser im selben Projekt arbeiten, müssen Board-Verschiebungen, neue Tasks und Notiz-Updates in Echtzeit übertragen werden.

---

## Akzeptanzkriterien

### 1. Live Board-Updates
- [ ] Wenn ein Nutzer eine Karte verschiebt, bearbeitet oder erstellt, aktualisiert sich das Board bei allen anderen aktiven Betrachtern sofort.
- [ ] Visuelle Indikatoren (z. B. dezentes Aufblinken der Karte) bei Live-Änderungen.

### 2. Präsenzanzeige & Notiz-Locking
- [ ] Avatar-Anzeige im Header ("Wer ist gerade in diesem Projekt online?").
- [ ] Notiz-Sperre (Soft-Lock): Wenn ein Nutzer eine Notiz bearbeitet, sehen andere einen Hinweis ("Wird gerade von Lukas bearbeitet") zur Vermeidung von Speicherkonflikten.

### 3. Stabile WebSocket-Verbindung
- [ ] Automatischer Reconnect bei Verbindungsabbruch.
- [ ] Fallback auf Polling, falls WebSockets im Netzwerk blockiert werden.

---

## Technische Aufgaben
1. **WebSocket-Server:** Einbindung von Socket.io oder nativem `ws`-Package im Express-Server.
2. **Event-Bus:** Kopplung der Repository-Events (z. B. `task.moved`, `note.updated`) an den WebSocket-Broadcast.
3. **Client-Hooks:** Ergänzung von `useRealtimeProject(projectId)` zur einfachen Integration in React.
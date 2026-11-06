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
- [x] Wenn ein Nutzer eine Karte verschiebt, bearbeitet oder erstellt, aktualisiert sich das Board bei allen anderen aktiven Betrachtern sofort.
- [x] Visuelle Indikatoren (z. B. dezentes Aufblinken der Karte) bei Live-Änderungen.

### 2. Präsenzanzeige & Notiz-Locking
- [x] Avatar-Anzeige im Header ("Wer ist gerade in diesem Projekt online?").
- [x] Notiz-Sperre (Soft-Lock): Wenn ein Nutzer eine Notiz bearbeitet, sehen andere einen Hinweis ("Wird gerade von Lukas bearbeitet") zur Vermeidung von Speicherkonflikten.

### 3. Stabile WebSocket-Verbindung
- [x] Automatischer Reconnect bei Verbindungsabbruch.
- [x] Fallback auf Polling, falls WebSockets im Netzwerk blockiert werden.

---

## Technische Aufgaben
1. **WebSocket-Server:** Einbindung von Socket.io oder nativem `ws`-Package im Express-Server.
2. **Event-Bus:** Kopplung der Repository-Events (z. B. `task.moved`, `note.updated`) an den WebSocket-Broadcast.
3. **Client-Hooks:** Ergänzung von `useRealtimeProject(projectId)` zur einfachen Integration in React.

---

## Entscheidungen (Klärung, 20.10.2026)
1. **Transport:** Socket.io (Reconnect, Polling-Fallback, Rooms, Acknowledgements für Sperren).
2. **Sperre:** Soft-Lock – andere sehen die Notiz schreibgeschützt mit „Trotzdem bearbeiten“.
3. **Beginn & Ende:** Sperre beim Fokus bzw. ersten Tastendruck; automatische Freigabe nach 60 s ohne Eingabe.
4. **Konfliktschutz:** Veraltete Stände werden mit `409` abgelehnt – Notizen über `baseUpdatedAt`, Tasks feldgenau über den Ausgangswert von Titel und Beschreibung (Verschieben einer Karte ist kein Konflikt).
5. **Tasks:** Soft-Lock auch für Titel und Beschreibung im Task-Dialog.
6. **Präsenz im Detail:** Avatare im Projekt-Header, auf Task-Karten, Notizlisten-Einträgen und im Projektwechsler („wer schaut gerade was an“).
7. **Betrachter:** Auch Personen mit der Rolle „viewer“ erscheinen in der Präsenz.
8. **Desktop-App & `AUTH=off`:** Live-Updates ja; Präsenz und Sperren ausgeblendet (der Konfliktschutz bleibt).
9. **Wissen:** „Alle Notizen“, Ordner und Tags aktualisieren sich ebenfalls live.
10. **Hervorhebung:** Neutraler Ring plus kleines Badge („von Lukas verschoben“); das Aktivitätsprotokoll aktualisiert sich live.
11. **Anderswo gelöscht:** Hinweis „Wurde von [Name] gelöscht“, Dialog bzw. Notiz schließt sich; kein Rückgängig.
12. **Umfang:** Kleines Team auf einer Instanz – Präsenz und Sperren im Speicher, kein Redis.
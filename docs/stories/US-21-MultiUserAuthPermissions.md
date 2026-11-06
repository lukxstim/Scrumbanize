# US-21: Benutzerverwaltung, Authentifizierung & Rollenrechte

## User Story
Als **Anwender von Scrumbanize in einer Mehrbenutzer- / Cloud-Umgebung**
möchte ich **mich sicher mit E-Mail und Passwort anmelden können sowie Zugriffsrechte für Projekte und Notizen verwalten**,
damit **meine Daten geschützt sind und ich gezielt bestimmen kann, wer welche Inhalte sehen oder bearbeiten darf**.

---

## Kontext & Zweck
Für das Hosting im Web und die Zusammenarbeit mehrerer Personen benötigt Scrumbanize ein solides Authentifizierungs- und Autorisierungssystem. Bisher ist die Anwendung auf Single-User ausgelegt. Mit dieser Story führen wir Login, Session-Management und rollenbasierte Rechte (RBAC) ein.

---

## Akzeptanzkriterien

### 1. Authentifizierung (Login & Registrierung)
- [x] Registrierungs- und Login-Formular in der Web-App (JWT-basiert oder HTTP-Only Session-Cookies).
- [x] Sicheres Hashing von Passwörtern mit Argon2 oder bcrypt.
- [x] Passwort-zurücksetzen-Funktion / Ersteinrichtung (Setup-Wizard für den ersten Admin-Account beim Serverstart).
- [x] Profilansicht: Anzeige von Name, Avatar/Initialen, E-Mail und Option zum Ändern des Passworts.

### 2. Rollen & Projekt-Berechtigungen (RBAC)
- [x] Rollenkonzept auf Systemebene: **System-Admin** vs. **Standard-Nutzer**.
- [x] Projektbezogene Rollen:
  - **Owner / Admin:** Voller Zugriff (Projekt löschen, Mitglieder verwalten, Spalten/WIP anpassen).
  - **Member:** Kann Aufgaben & Notizen erstellen, verschieben, bearbeiten und kommentieren.
  - **Viewer:** Nur Lesezugriff auf Boards, Notizen und Analysen.
- [x] Dialog "Projektmitglieder verwalten" im Projekt-Header zum Einladen und Vergeben von Rollen.

### 3. Abwärtskompatibilität (Desktop-Mode)
- [x] Im lokalen Electron-Desktop-Modus kann die Authentifizierung optional deaktiviert bleiben (Auto-Login als lokaler Standard-User).

---

## Technische Aufgaben
1. **Datenbank-Schema (Migration):** Erstellen der Tabellen `users`, `sessions` und `project_members` (mit `project_id`, `user_id`, `role`).
2. **Auth-Middleware:** Express-Middleware (`requireAuth`, `requireProjectRole('member')`) zur Absicherung aller `/api/`-Routen.
3. **Frontend-Auth Store:** React-Context / Hook (`useAuth`) zur Verwaltung des Login-States und geschützter Routen (`<ProtectedRoute>`).
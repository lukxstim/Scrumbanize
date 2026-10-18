# US-23: Cloud-Deployment, Docker Compose & Server-Infrastruktur

## User Story
Als **Server-Administrator / DevOps-Verantwortlicher**
möchte ich **Scrumbanize einfach per Docker Compose auf einem Cloud-Server (z. B. Hetzner, VPS) mit automatischem SSL-Zertifikat hosten**,
damit **die App rund um die Uhr sicher im Browser erreichbar ist**.

---

## Kontext & Zweck
Um Scrumbanize als Web-App im Team oder für den eigenen Cloud-Zugriff bereitzustellen, wird ein produktionsbereites Deployment-Setup benötigt. Das beinhaltet Containerisierung, Reverse Proxy mit HTTPS (Let's Encrypt) und persistente Speicheranbindung.

---

## Akzeptanzkriterien

### 1. Docker & Docker Compose Setup
- [ ] Optimiertes Multi-Stage `Dockerfile` (Node.js Build-Stage + schlanke Production-Runtime-Stage).
- [ ] Produktionsfertiges `docker-compose.yml` mit:
  - Scrumbanize-App-Container.
  - Reverse Proxy (Caddy oder Nginx-Proxy-Automation) für automatische HTTPS/SSL-Zertifikate.
  - Persistenten Volumes für SQLite-Datenbank (`scrumbanize.db`), Uploads und automatisierte Backups.

### 2. Umgebungs-Konfiguration (Environment Variables)
- [ ] Unterstützung wichtiger `.env`-Variablen:
  - `PORT`, `NODE_ENV=production`
  - `JWT_SECRET` (für Auth-Tokens)
  - `DATABASE_URL` (Pfad zur SQLite-Datei oder Anbindung an PostgreSQL)
  - `BASE_URL` / `ALLOWED_ORIGINS` (CORS-Schutz)

### 3. Backup- & Wartungs-Skripte
- [ ] Integrierter Cronjob / Shell-Skript im Container zur täglichen automatischen Sicherung der Datenbank im Backup-Ordner.
- [ ] Health-Check Endpoint (`GET /api/health`) für Server-Monitoring.

---

## Technische Aufgaben
1. **Dockerfile & Compose:** Erstellen und Testen des Setups lokal mit `docker compose up`.
2. **Reverse Proxy Config:** Caddyfile / Nginx-Template mit WebSockets- und SSE-Support vorkonfigurieren.
3. **Dokumentation:** Ausführliche Anleitung `docs/DEPLOYMENT.md` für das Aufsetzen auf einem frischen Ubuntu/Debian VPS.
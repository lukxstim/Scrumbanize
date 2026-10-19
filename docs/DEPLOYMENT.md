# Scrumbanize auf einem eigenen Server

Diese Anleitung bringt Scrumbanize auf einen frischen Linux-Server (z. B. bei Hetzner), erreichbar unter einer eigenen Domain mit HTTPS. Dafür sorgen zwei Container:

- **scrumbanize** – die App mit SQLite-Datenbank, Anhängen und täglichen Backups,
- **caddy** – nimmt die Anfragen aus dem Internet an, holt und erneuert das Let's-Encrypt-Zertifikat selbst und leitet `http://` auf `https://` um.

Zeitaufwand: etwa 30 Minuten.

## 1. Was du brauchst

- **Einen Server** mit Ubuntu 24.04 oder Debian 12, mindestens **2 GB RAM** (der Build braucht so viel) und 20 GB Platz, z. B. Hetzner CX22. Zugang per SSH als `root` oder mit `sudo`.
- **Eine Domain oder Subdomain**, z. B. `scrumbanize.example.org`, deren DNS du bearbeiten kannst.
- **Eine E-Mail-Adresse** für Let's Encrypt.

## 2. DNS-Eintrag setzen

Beim Anbieter der Domain einen **A-Eintrag** für den Host-Namen auf die IPv4-Adresse des Servers setzen, und – wenn der Server eine hat – einen **AAAA-Eintrag** auf die IPv6-Adresse. Prüfen (vom eigenen Rechner):

```sh
nslookup scrumbanize.example.org
```

Die Adresse des Servers muss erscheinen, bevor du in Schritt 6 startest – sonst bekommt Caddy kein Zertifikat.

## 3. Server vorbereiten

Als `root` anmelden (`ssh root@<IP>`), dann:

```sh
apt update && apt upgrade -y
# Sicherheitsupdates automatisch einspielen
apt install -y unattended-upgrades git ufw

# Ein eigener Benutzer statt root
adduser scrumbanize
usermod -aG sudo scrumbanize
# Den SSH-Schlüssel von root übernehmen, damit die Anmeldung als scrumbanize klappt
rsync --archive --chown=scrumbanize:scrumbanize ~/.ssh /home/scrumbanize

# Firewall: nur SSH, HTTP und HTTPS (443/udp für HTTP/3)
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw enable
```

Bei Hetzner kann zusätzlich eine Firewall in der Cloud Console eingerichtet sein – dort dieselben Ports freigeben.

Ab jetzt als `scrumbanize` anmelden: `ssh scrumbanize@<IP>`.

## 4. Docker installieren

Aus dem offiziellen Docker-Repository (Ubuntu; für Debian `ubuntu` in beiden URLs durch `debian` ersetzen):

```sh
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Docker ohne sudo benutzen (danach einmal ab- und wieder anmelden)
sudo usermod -aG docker scrumbanize
```

Prüfen: `docker compose version` zeigt eine Version 2.x.

## 5. Scrumbanize holen und einstellen

Das Repository ist privat. Am einfachsten mit einem **Deploy Key** (nur Lesezugriff auf dieses eine Repository):

```sh
ssh-keygen -t ed25519 -f ~/.ssh/scrumbanize-deploy -N ""
cat ~/.ssh/scrumbanize-deploy.pub
```

Den ausgegebenen Schlüssel auf GitHub unter **Repository → Settings → Deploy keys → Add deploy key** eintragen (ohne Schreibzugriff). Dann:

```sh
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/scrumbanize-deploy
EOF

git clone git@github.com:lukxstim/Scrumbanize.git ~/scrumbanize
cd ~/scrumbanize
cp .env.example .env
nano .env
```

In `.env` mindestens eintragen:

| Variable | Beispiel | |
|---|---|---|
| `DOMAIN` | `scrumbanize.example.org` | der Host-Name aus Schritt 2, ohne `https://` |
| `ACME_EMAIL` | `admin@example.org` | für Let's Encrypt |
| `TZ` | `Europe/Berlin` | Zeitzone für die Backup-Uhrzeit |

Die übrigen Werte (Backup-Uhrzeit, wie viele Backups aufgehoben werden, Anmeldung) sind in `.env.example` erklärt und haben sinnvolle Vorgaben.

## 6. Starten

```sh
docker compose up -d --build
```

Der erste Build dauert einige Minuten. Danach:

```sh
docker compose ps          # scrumbanize "healthy", caddy "running"
docker compose logs caddy  # "certificate obtained successfully" für deine Domain
```

## 7. Erstes Konto anlegen

Der Server schreibt beim ersten Start einen **Einrichtungscode** in sein Log:

```sh
docker compose logs scrumbanize | grep -A1 Ersteinrichtung
# Ersteinrichtung: https://scrumbanize.example.org/setup
# Einrichtungscode: K7PM-3XQD
```

Die Adresse im Browser öffnen, Code, Name, E-Mail und Passwort eingeben – dieses Konto ist Administrator. Weitere Personen lädt man in der App über die **Benutzerverwaltung** ein (Bild oben rechts).

Kontrolle von außen:

```sh
curl https://scrumbanize.example.org/api/health
# {"status":"ok","version":"1.1.0","database":"ok","backups":"ok"}
```

## 8. Backups

Die Backups liegen auf dem Server in `~/scrumbanize/backups/`:

| Ordner / Datei | Inhalt |
|---|---|
| `taeglich/scrumbanize-backup-JJJJ-MM-TT.zip` | jede Nacht um `BACKUP_TIME` (Standard 03:00); die neuesten `BACKUP_KEEP` (Standard 14) bleiben |
| `vor-update-v<Schema>-<Zeit>.db` | Kopie der Datenbank, bevor ein Update sie umbaut; die neuesten 5 bleiben |
| `vor-wiederherstellung-<Zeit>.zip` | Stand vor einer Wiederherstellung in der App |
| `manuell/…zip` | Backups von Hand (siehe unten) |

Ein ZIP enthält die Datenbank, alle Anhänge und Profilbilder – also **alle Daten aller Benutzer**, auch die Passwort-Hashes. Ob das tägliche Backup klappt, zeigt die App Administratoren unter **Einstellungen → Backup**; `/api/health` meldet bei Problemen `"backups": "not_writable"` oder `"failing"`.

**Ein Backup sofort:**

```sh
docker compose exec scrumbanize node server/dist/backupCli.js                       # nach backups/manuell/
docker compose exec -T scrumbanize node server/dist/backupCli.js --out - > jetzt.zip  # direkt in eine Datei
```

**Auf einen anderen Rechner sichern** – ein Backup nur auf demselben Server schützt nicht vor dessen Ausfall. Zum Beispiel jede Nacht nach dem Backup auf ein NAS oder einen zweiten Server kopieren (`crontab -e`):

```
30 4 * * * rsync -a ~/scrumbanize/backups/ backup@nas.example.org:scrumbanize-backups/
```

Für einen Cloud-Speicher eignen sich [restic](https://restic.net) (verschlüsselt) oder [rclone](https://rclone.org). Unverschlüsselt sollten die Backups nur an Orten liegen, denen du so vertraust wie dem Server selbst.

**Wiederherstellen:** In der App unter **Einstellungen → Wiederherstellen** das ZIP hochladen. Der Stand davor wird vorher automatisch gesichert.

## 9. Updates

```sh
cd ~/scrumbanize
git pull
docker compose up -d --build
```

Die Daten bleiben im Volume `scrumbanize_scrumbanize-data`. Ändert die neue Version die Datenbank, legt sie vorher `backups/vor-update-…db` an.

**Zurück zur vorigen Version**, falls etwas nicht stimmt:

```sh
docker compose stop scrumbanize
# Die Kopie von vor dem Update zurücklegen (Dateiname aus backups/ einsetzen)
docker compose run --rm --no-deps scrumbanize sh -c \
  'cp /data/backups/vor-update-v15-2026-10-19T03-00-00.db /data/scrumbanize.db && rm -f /data/scrumbanize.db-wal /data/scrumbanize.db-shm'
git checkout <vorige Version, z. B. v1.1.0>
docker compose up -d --build
```

Die Anhänge ändert ein Update nie; nur die Datenbank muss zurück.

## 10. Alltag

```sh
docker compose ps                   # läuft alles?
docker compose logs -f scrumbanize  # Log der App (Strg+C beendet die Anzeige)
docker compose restart scrumbanize  # App neu starten
docker compose down                 # alles anhalten (Daten bleiben)
docker system prune                 # alte Images nach Updates entfernen
df -h                               # Platz auf der Platte
```

Logs sind auf 3 × 10 MB je Container begrenzt.

## 11. Fehlersuche

| Problem | Ursache und Lösung |
|---|---|
| Caddy bekommt kein Zertifikat (`docker compose logs caddy`) | DNS zeigt noch nicht auf den Server (Schritt 2, kann nach einer Änderung bis zu einer Stunde dauern) oder Port 80/443 ist zu (Firewall des Servers und des Anbieters). Nach vielen Fehlversuchen sperrt Let's Encrypt für eine Stunde – erst die Ursache beheben, dann `docker compose restart caddy`. |
| `docker compose up` meldet „env file .env not found“ | `cp .env.example .env` vergessen (Schritt 5). |
| Die App startet nicht, im Log steht „Invalid configuration“ | Ein Wert in `.env` stimmt nicht; die Meldung nennt jeden einzelnen. Korrigieren, dann `docker compose up -d`. |
| Änderungen scheitern mit „Requests are only accepted from Scrumbanize itself“ (403) | Die App wird unter einer anderen Adresse aufgerufen als `DOMAIN` bzw. `BASE_URL`. Weitere Adressen in `ALLOWED_ORIGINS` eintragen. |
| `/api/health` meldet `"backups": "not_writable"` | Der Ordner `backups/` gehört nicht dem Benutzer der App. `docker compose up -d` startet den Dienst `backup-folder`, der das korrigiert; sonst von Hand: `sudo chown -R 1000:1000 ~/scrumbanize/backups`. |
| `/api/health` meldet `"backups": "failing"` | Das letzte tägliche Backup schlug fehl; der Grund steht unter **Einstellungen → Backup** und im Log. Häufig: Platte voll (`df -h`). |
| Port 80 oder 443 ist belegt | Ein anderer Webserver läuft schon (`sudo ss -tlnp`); ihn beenden oder Scrumbanize auf einem eigenen Server betreiben. |
| Caddy warnt „failed to sufficiently increase receive buffer size“ | Nur ein Hinweis zu HTTP/3; es funktioniert trotzdem. |

## Ohne Domain auf dem eigenen Rechner ausprobieren

```sh
docker compose -f docker-compose.local.yml up -d --build
docker compose -f docker-compose.local.yml logs scrumbanize   # Einrichtungscode
```

Dann <http://localhost:3000> öffnen. Ohne Caddy und ohne HTTPS – nur zum Ausprobieren, nicht für einen Server im Internet.

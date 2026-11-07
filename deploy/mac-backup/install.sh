#!/bin/bash
# Sets up the daily backup of one person's Scrumbanize notes on this Mac: asks for the account, keeps the password in the keychain, installs
# backup.sh and a launchd job, and makes a first backup. Run it again to change something; uninstall with --remove.
set -euo pipefail

LABEL="de.scrumbanize.backup"
APP_DIR="$HOME/Library/Application Support/Scrumbanize-Backup"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
CONFIG="$HOME/.scrumbanize-backup.conf"
HERE="$(cd "$(dirname "$0")" && pwd)"

if [ "${1:-}" = "--remove" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST" "$CONFIG"
  rm -rf "$APP_DIR"
  security delete-generic-password -s "Scrumbanize-Backup" >/dev/null 2>&1 || true
  echo "Das automatische Backup ist entfernt. Die bisherigen Backups bleiben in ihrem Ordner."
  exit 0
fi

echo "Automatisches Backup deiner Scrumbanize-Notizen einrichten"
echo
read -r -p "Adresse der Web-Version [https://scrumbanize.onrender.com]: " SERVER
SERVER="${SERVER:-https://scrumbanize.onrender.com}"
SERVER="${SERVER%/}"
read -r -p "E-Mail deines Scrumbanize-Kontos: " EMAIL
read -r -s -p "Passwort: " PASSWORD
echo
read -r -p "Ordner für die Backups [$HOME/Scrumbanize-Backups]: " BACKUP_DIR
BACKUP_DIR="${BACKUP_DIR:-$HOME/Scrumbanize-Backups}"
BACKUP_DIR="${BACKUP_DIR/#\~/$HOME}"
read -r -p "Wie viele Tage aufheben? [30]: " KEEP
KEEP="${KEEP:-30}"
read -r -p "Um wie viel Uhr täglich? (Stunde, 0–23) [20]: " HOUR
HOUR="${HOUR:-20}"

case "$KEEP" in '' | *[!0-9]*) echo "Bitte eine Zahl für die Anzahl angeben."; exit 1 ;; esac
case "$HOUR" in '' | *[!0-9]*) echo "Bitte eine Stunde von 0 bis 23 angeben."; exit 1 ;; esac
[ "$HOUR" -le 23 ] || { echo "Bitte eine Stunde von 0 bis 23 angeben."; exit 1; }

# The password goes into the keychain; -U replaces an older one.
security add-generic-password -U -s "Scrumbanize-Backup" -a "$EMAIL" -l "Scrumbanize-Backup" -w "$PASSWORD"
unset PASSWORD

{
  printf 'SERVER=%q\n' "$SERVER"
  printf 'EMAIL=%q\n' "$EMAIL"
  printf 'BACKUP_DIR=%q\n' "$BACKUP_DIR"
  printf 'KEEP=%q\n' "$KEEP"
} > "$CONFIG"
chmod 600 "$CONFIG"

mkdir -p "$APP_DIR" "$HOME/Library/LaunchAgents"
cp "$HERE/backup.sh" "$APP_DIR/backup.sh"
chmod 755 "$APP_DIR/backup.sh"

# Every day at HOUR:00. A Mac that is asleep then catches up when it wakes; one that is switched off skips that day.
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$APP_DIR/backup.sh</string></array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>$HOUR</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/Scrumbanize-Backup.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo
echo "Erstes Backup wird heruntergeladen …"
if /bin/bash "$APP_DIR/backup.sh"; then
  echo "Fertig. Das erste Backup liegt in: $BACKUP_DIR"
  echo "Ab jetzt täglich um $HOUR:00 Uhr; die letzten $KEEP Tage bleiben."
  echo "Protokoll: ~/Library/Logs/Scrumbanize-Backup.log"
else
  echo "Das erste Backup hat nicht geklappt – Grund siehe ~/Library/Logs/Scrumbanize-Backup.log"
  tail -n 3 "$HOME/Library/Logs/Scrumbanize-Backup.log" || true
  exit 1
fi

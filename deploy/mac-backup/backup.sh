#!/bin/bash
# Downloads the personal export of one Scrumbanize account – every notebook the person may see with its attachments,
# the tasks as CSV and the calendar (.ics) – as a ZIP into a folder on this Mac, and keeps the newest ones. The same
# as Einstellungen → „Meine Daten exportieren“. Set up by install.sh, run every day by launchd. The password is in the
# macOS keychain (service "Scrumbanize-Backup"), never in this file.
set -uo pipefail

CONFIG="$HOME/.scrumbanize-backup.conf"
LOG="$HOME/Library/Logs/Scrumbanize-Backup.log"
mkdir -p "$(dirname "$LOG")"
log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$LOG"; }
fail() {
  log "FEHLER: $1"
  osascript -e "display notification \"$1\" with title \"Scrumbanize-Backup fehlgeschlagen\"" >/dev/null 2>&1
  exit 1
}

[ -f "$CONFIG" ] || fail "Keine Einstellungen gefunden – bitte install.sh noch einmal ausführen."
# shellcheck source=/dev/null
source "$CONFIG" # SERVER, EMAIL, BACKUP_DIR, KEEP

PASSWORD=$(security find-generic-password -s "Scrumbanize-Backup" -a "$EMAIL" -w 2>/dev/null) ||
  fail "Kein Passwort im Schlüsselbund – bitte install.sh noch einmal ausführen."

WORK=$(mktemp -d)
JAR="$WORK/cookies"
# Log out again at the end, so no session stays open on the server.
finish() { [ -s "$JAR" ] && curl -sS -m 30 -o /dev/null -b "$JAR" -X POST "$SERVER/api/auth/logout" >/dev/null 2>&1; rm -rf "$WORK"; }
trap finish EXIT

# Log in; backslashes and quotes in e-mail or password are escaped for the JSON.
json_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }
BODY=$(printf '{"email":"%s","password":"%s"}' "$(json_escape "$EMAIL")" "$(json_escape "$PASSWORD")")
unset PASSWORD
STATUS=$(curl -sS -m 90 -o /dev/null -w '%{http_code}' -c "$JAR" -H 'Content-Type: application/json' \
  --data-binary @- "$SERVER/api/auth/login" <<< "$BODY") || fail "Server nicht erreichbar ($SERVER)."
unset BODY
case "$STATUS" in
  200) ;;
  401) fail "Anmeldung abgelehnt – stimmen E-Mail und Passwort noch?" ;;
  429) fail "Zu viele Anmeldeversuche – später noch einmal." ;;
  *) fail "Anmeldung fehlgeschlagen (HTTP $STATUS)." ;;
esac

FILE="scrumbanize-export-$(date '+%Y-%m-%d').zip"
STATUS=$(curl -sS -m 1800 -o "$WORK/$FILE" -w '%{http_code}' -b "$JAR" "$SERVER/api/account/export?format=md") ||
  fail "Download abgebrochen."
[ "$STATUS" = 200 ] || fail "Export fehlgeschlagen (HTTP $STATUS)."
unzip -tq "$WORK/$FILE" >/dev/null 2>&1 || fail "Die heruntergeladene Datei ist kein gültiges ZIP."

mkdir -p "$BACKUP_DIR" || fail "Ordner $BACKUP_DIR lässt sich nicht anlegen."
mv -f "$WORK/$FILE" "$BACKUP_DIR/$FILE" || fail "Backup lässt sich nicht in $BACKUP_DIR speichern."

# Keep the newest $KEEP exports (one per day).
ls -1 "$BACKUP_DIR"/scrumbanize-export-*.zip 2>/dev/null | sort -r | tail -n +"$((KEEP + 1))" |
  while IFS= read -r old; do rm -f "$old"; done

log "OK: $BACKUP_DIR/$FILE ($(du -h "$BACKUP_DIR/$FILE" | cut -f1))"

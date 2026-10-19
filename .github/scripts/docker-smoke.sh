#!/usr/bin/env bash
# Smoke test of the Docker setup (US-23), run by CI on Linux:
#   docker-smoke.sh local       – docker-compose.local.yml from the outside: health, setup, login, a project, the
#                                 daily backup, a backup from the command line, the user the app runs as
#   docker-smoke.sh production  – the app container of docker-compose.yml with its hardening (read-only file system,
#                                 no capabilities) and the bind-mounted ./backups; Caddy is checked by `caddy validate`
#                                 in the workflow, since a certificate needs a real domain
set -euo pipefail

mode="${1:?usage: docker-smoke.sh local|production}"
fail() {
  echo "FAIL: $*" >&2
  exit 1
}
# Retries a check once a second, for up to $TRIES seconds (default 30): the daily backup is written right after
# the start, and Docker reports "healthy" only after the first health check.
eventually() {
  for _ in $(seq 1 "${TRIES:-30}"); do
    if "$@"; then return 0; fi
    sleep 1
  done
  return 1
}

if [[ "$mode" == local ]]; then
  compose=(docker compose -f docker-compose.local.yml)
  base=http://localhost:3000
  # Due at any time of day, so the test does not depend on when it runs.
  export BACKUP_TIME=00:00
  "${compose[@]}" up -d --build --wait --wait-timeout 180

  health=$(curl -fsS "$base/api/health")
  echo "health: $health"
  jq -e '.status == "ok" and .database == "ok" and .backups == "ok" and (.version | type == "string")' <<<"$health" >/dev/null || fail "health: $health"

  # The setup code is only in the server's output.
  code=""
  for _ in $(seq 1 30); do
    code=$("${compose[@]}" logs scrumbanize | sed -n 's/.*Einrichtungscode: \([A-Z0-9-]*\).*/\1/p' | tail -n 1)
    [[ -n "$code" ]] && break
    sleep 1
  done
  [[ -n "$code" ]] || fail "no setup code in the log"

  jar=$(mktemp)
  json=(-H 'Content-Type: application/json')
  curl -fsS -c "$jar" "${json[@]}" \
    -d "{\"code\":\"$code\",\"name\":\"CI\",\"email\":\"ci@example.org\",\"password\":\"ci-password-1234\"}" \
    "$base/api/auth/setup" >/dev/null || fail "setup"
  curl -fsS -b "$jar" "${json[@]}" -d '{"name":"CI-Projekt","color":"sky"}' "$base/api/projects" >/dev/null || fail "create a project"
  curl -fsS -b "$jar" "$base/api/projects" | jq -e 'map(.name) | index("CI-Projekt") != null' >/dev/null || fail "project not listed"
  # A new login with the password works, too.
  curl -fsS "${json[@]}" -d '{"email":"ci@example.org","password":"ci-password-1234"}' "$base/api/auth/login" >/dev/null || fail "login"

  daily_backup_done() { curl -fsS -b "$jar" "$base/api/backup/status" | jq -e '.schedule.time == "00:00" and .last != null and .error == null' >/dev/null; }
  eventually daily_backup_done || fail "no daily backup: $(curl -fsS -b "$jar" "$base/api/backup/status")"

  "${compose[@]}" exec -T scrumbanize node server/dist/backupCli.js --out - >backup.zip
  unzip -p backup.zip manifest.json | jq -e '.app == "scrumbanize" and .counts.projects >= 1' >/dev/null || fail "backup from the command line"
  # Read whole first: with pipefail, `grep -q` ending the pipe early would count as a failure.
  entries=$(unzip -Z1 backup.zip)
  grep -qx scrumbanize.db <<<"$entries" || fail "backup without database"

  [[ "$("${compose[@]}" exec -T scrumbanize id -u)" == 1000 ]] || fail "the app does not run as the user node"

  "${compose[@]}" down -v
  echo "local: ok"

elif [[ "$mode" == production ]]; then
  compose=(docker compose)
  [[ -f .env ]] || cp .env.example .env
  sed -i 's/^BACKUP_TIME=.*/BACKUP_TIME=00:00/' .env
  # Only the app (and the one-off that hands ./backups to it); Caddy would wait for a certificate. Waited for by hand:
  # some Compose versions count the finished one-off as a failure of `up --wait`.
  "${compose[@]}" up -d --build scrumbanize
  healthy() { [[ "$(docker inspect -f '{{.State.Health.Status}}' "$("${compose[@]}" ps -q scrumbanize)")" == healthy ]]; }
  TRIES=120 eventually healthy || fail "the app container did not become healthy"
  [[ "$(docker inspect -f '{{.State.ExitCode}}' "$("${compose[@]}" ps -aq backup-folder)")" == 0 ]] || fail "backup-folder failed"

  # Not published to the host: asked from inside the container.
  health=$("${compose[@]}" exec -T scrumbanize node -e "fetch('http://localhost:3000/api/health').then((r) => r.text()).then(console.log)")
  echo "health: $health"
  jq -e '.status == "ok" and .backups == "ok"' <<<"$health" >/dev/null || fail "health: $health"

  # The daily backup lands in ./backups on the host, written by the unprivileged user.
  daily_on_host() { compgen -G 'backups/taeglich/scrumbanize-backup-*.zip' >/dev/null; }
  eventually daily_on_host || fail "no daily backup in ./backups/taeglich"

  # A backup from the command line needs a writable TMPDIR on the read-only file system.
  "${compose[@]}" exec -T scrumbanize node server/dist/backupCli.js
  compgen -G 'backups/manuell/scrumbanize-backup-*.zip' >/dev/null || fail "no manual backup in ./backups/manuell"

  if "${compose[@]}" exec -T scrumbanize sh -c 'touch /app/written' 2>/dev/null; then fail "the image's file system is writable"; fi
  [[ "$("${compose[@]}" exec -T scrumbanize id -u)" == 1000 ]] || fail "the app does not run as the user node"

  "${compose[@]}" down -v
  # Written by the container's user (UID 1000).
  sudo rm -rf backups
  echo "production: ok"

else
  fail "unknown mode $mode"
fi

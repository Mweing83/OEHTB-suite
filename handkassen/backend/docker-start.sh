#!/bin/sh
# Start der Handkassen im Container (Haertung nach Security-Audit 2026-10).
#
# Der Container startet als root, damit bestehende Beleg-Volumes (frueher von
# root beschrieben) dem Benutzer "node" uebergeben werden koennen. Danach
# laufen Migration, Seed und Server ausschliesslich als "node".
set -e

if [ "$(id -u)" = "0" ]; then
  # Nur Dateien anfassen, die noch nicht "node" gehoeren (schnell bei vielen Belegen).
  find /app/uploads ! -user node -exec chown node:node {} + 2>/dev/null || true
  exec setpriv --reuid=node --regid=node --init-groups --inh-caps=-all sh "$0" "$@"
fi

# Ab hier als "node":
# - Migration mit Backoff (bis 6 Versuche, 10s Pause): faengt kurze DB-Aussetzer ab.
# - Seed ist idempotent und darf "weich" scheitern.
# - "exec node": node ersetzt die Shell, damit SIGTERM den Prozess erreicht.
n=0
until npx prisma migrate deploy; do
  n=$((n+1))
  if [ "$n" -ge 6 ]; then
    echo "Migration nach 6 Versuchen fehlgeschlagen - Abbruch"
    exit 1
  fi
  echo "Migration fehlgeschlagen (Versuch $n/6) - erneuter Versuch in 10s..."
  sleep 10
done
npm run seed || echo "Seed uebersprungen"
exec node dist/server.js

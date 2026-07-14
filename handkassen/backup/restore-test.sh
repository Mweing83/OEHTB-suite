#!/bin/sh
# ÖHTB Handkassen – Probe-Wiederherstellung (Feuerprobe / Fire-Drill)
#
# Beweist, dass sich die neueste (oder eine angegebene) Sicherung TATSÄCHLICH
# zurückspielen lässt – in eine WEGWERF-Datenbank. Die echte Datenbank und die
# Belegfotos werden dabei NIE angefasst. So merkt man, dass die Sicherungen
# brauchbar sind, BEVOR man sie im Ernstfall braucht.
#
# Aufruf im Backup-Container (Beispiel siehe BACKUP.md):
#   docker compose --profile produktion exec handkassen-backup \
#     /bin/sh /backup/restore-test.sh
#   # optional mit konkretem Archiv:
#   ... /backup/restore-test.sh /backups/lokal/taeglich/handkassen_JJJJMMTT_HHMMSS.tar.gz
set -eu

ARCHIV="${1:-}"
# Ohne Argument: neueste tägliche Sicherung im lokalen Ablageort verwenden.
if [ -z "$ARCHIV" ]; then
  ARCHIV=$(ls -1t /backups/lokal/taeglich/handkassen_*.tar.gz 2>/dev/null | head -n1 || true)
fi
if [ -z "$ARCHIV" ] || [ ! -f "$ARCHIV" ]; then
  echo "FEHLER: keine Sicherung gefunden."
  echo "Aufruf: restore-test.sh [pfad-zur-archivdatei.tar.gz]"
  exit 1
fi

export PGPASSWORD="$POSTGRES_PASSWORD"
HOST="${DB_HOST:-db}"
SCRATCH="${POSTGRES_DB}_restore_test"

echo "Probe-Wiederherstellung aus:"
echo "  $ARCHIV"
echo "Ziel: Wegwerf-Datenbank '$SCRATCH' auf $HOST – die echte Datenbank bleibt unberührt."

WORK=$(mktemp -d)
# Aufräumen: Wegwerf-DB und temporäre Dateien in JEDEM Fall wieder entfernen.
aufraeumen() {
  psql -h "$HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -c "DROP DATABASE IF EXISTS \"$SCRATCH\";" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap aufraeumen EXIT

# 1) Datenbank-Dump aus dem Archiv holen
tar xzf "$ARCHIV" -C "$WORK"
if [ ! -f "$WORK/datenbank.dump" ]; then
  echo "FEHLER: datenbank.dump nicht im Archiv gefunden – Archiv beschädigt?"
  exit 1
fi

# 2) Wegwerf-Datenbank frisch anlegen (evtl. Reste einer früheren Probe löschen)
psql -h "$HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "DROP DATABASE IF EXISTS \"$SCRATCH\";" >/dev/null
psql -h "$HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "CREATE DATABASE \"$SCRATCH\";" >/dev/null

# 3) Sicherung in die Wegwerf-Datenbank einspielen
echo "Spiele Sicherung in die Wegwerf-Datenbank ein..."
pg_restore -h "$HOST" -U "$POSTGRES_USER" -d "$SCRATCH" --no-owner "$WORK/datenbank.dump"

# 4) Plausibilitätsprüfung: Wurden Tabellen und Daten wiederhergestellt?
TABELLEN=$(psql -h "$HOST" -U "$POSTGRES_USER" -d "$SCRATCH" -tA \
  -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")
BUCHUNGEN=$(psql -h "$HOST" -U "$POSTGRES_USER" -d "$SCRATCH" -tA \
  -c "SELECT count(*) FROM buchung;" 2>/dev/null || echo "n/v")
echo "Ergebnis: $TABELLEN Tabelle(n) wiederhergestellt; Buchungen: $BUCHUNGEN"

if [ "${TABELLEN:-0}" -ge 1 ] 2>/dev/null; then
  echo "PROBE-WIEDERHERSTELLUNG ERFOLGREICH – die Sicherung ist brauchbar."
else
  echo "PROBE-WIEDERHERSTELLUNG FEHLGESCHLAGEN – Sicherung prüfen!"
  exit 1
fi

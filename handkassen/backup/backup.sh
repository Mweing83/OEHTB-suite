#!/bin/sh
# ÖHTB Handkassen – Datensicherung
# Sichert Datenbank (pg_dump) + Belegfotos (uploads) als ein Archiv und
# verteilt es auf alle verfügbaren Ablageorte (lokal, NAS, USB).
# Wird vom Suite-Backup-Container (handkassen-backup) planmaessig aufgerufen (siehe entrypoint.sh),
# kann aber auch manuell gestartet werden (siehe BACKUP.md).
set -eu

# Ist ein Ziel aktiv? Steuerung über den Admin-Tab; Standard: aktiv.
ziel_aktiv() {
  case "${1:-true}" in
    f|false|0|nein|no|aus) return 1 ;;
    *) return 0 ;;
  esac
}

TS=$(date +%Y%m%d_%H%M%S)
TAG=$(date +%d)        # Tag im Monat (für Monatsstand am 01.)
MONATTAG=$(date +%m%d) # Monat+Tag  (für Jahresstand am 0101)
ARCHIV="handkassen_${TS}.tar.gz"

echo "[$(date)] Sicherung gestartet ($TS)"

WORK=$(mktemp -d)

# 1) Datenbank-Dump im Custom-Format (mit pg_restore zurückspielbar)
export PGPASSWORD="$POSTGRES_PASSWORD"
pg_dump -h "${DB_HOST:-db}" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$WORK/datenbank.dump"

# 2) Belegfotos einpacken (falls vorhanden)
if [ -d /uploads ]; then
  tar czf "$WORK/uploads.tar.gz" -C /uploads .
fi

# 3) Info-Datei zum Archiv legen
{
  echo "Handkassen-Sicherung"
  echo "Zeitpunkt:  $TS"
  echo "Datenbank:  $POSTGRES_DB"
} > "$WORK/INFO.txt"

# 4) Alles zu einem Archiv bündeln
tar czf "/tmp/$ARCHIV" -C "$WORK" .
rm -rf "$WORK"

# 5) Auf alle bereiten Ablageorte verteilen + alte Stände aufräumen
KOPIERT=0
for ORT in /backups/lokal /backups/nas /backups/usb; do
  [ -d "$ORT" ] || continue

  # NAS/USB nur verwenden, wenn sie aktiv geschaltet UND die Markierungsdatei
  # ".ziel-ok" vorhanden ist (Schutz vor einem nicht eingebundenen Laufwerk).
  case "$ORT" in
    /backups/nas)
      ziel_aktiv "${ZIEL_NAS_AKTIV:-true}" || { echo "[$(date)] NAS ist deaktiviert – übersprungen."; continue; }
      if [ ! -f "$ORT/.ziel-ok" ]; then
        echo "[$(date)] WARNUNG: $ORT nicht bereit (.ziel-ok fehlt) – übersprungen." >&2
        continue
      fi
      ;;
    /backups/usb)
      ziel_aktiv "${ZIEL_USB_AKTIV:-true}" || { echo "[$(date)] USB ist deaktiviert – übersprungen."; continue; }
      if [ ! -f "$ORT/.ziel-ok" ]; then
        echo "[$(date)] WARNUNG: $ORT nicht bereit (.ziel-ok fehlt) – übersprungen." >&2
        continue
      fi
      ;;
  esac

  mkdir -p "$ORT/taeglich" "$ORT/monatlich" "$ORT/jaehrlich"
  cp "/tmp/$ARCHIV" "$ORT/taeglich/"
  [ "$TAG" = "01" ] && cp "/tmp/$ARCHIV" "$ORT/monatlich/"
  [ "$MONATTAG" = "0101" ] && cp "/tmp/$ARCHIV" "$ORT/jaehrlich/"

  # Aufbewahrung: nur die jüngsten N Tages-/Monatsstände behalten.
  # Jahresstände bleiben dauerhaft erhalten (7-Jahres-Pflicht).
  ls -1t "$ORT/taeglich/"handkassen_*.tar.gz 2>/dev/null \
    | tail -n +"$(( ${AUFBEWAHRUNG_TAEGLICH:-14} + 1 ))" \
    | while read -r f; do rm -f "$f"; done
  ls -1t "$ORT/monatlich/"handkassen_*.tar.gz 2>/dev/null \
    | tail -n +"$(( ${AUFBEWAHRUNG_MONATLICH:-12} + 1 ))" \
    | while read -r f; do rm -f "$f"; done

  KOPIERT=$((KOPIERT + 1))
  echo "[$(date)] -> gesichert nach $ORT"
done

rm -f "/tmp/$ARCHIV"

if [ "$KOPIERT" -eq 0 ]; then
  echo "[$(date)] FEHLER: Kein Ablageort verfügbar – nichts gesichert!" >&2
  exit 1
fi

# Erfolg vermerken (für eine spätere Überwachung / Anzeige im Dashboard)
echo "$TS" > /backups/lokal/LETZTER_ERFOLG.txt 2>/dev/null || true
echo "[$(date)] Sicherung erfolgreich auf $KOPIERT Ablageort(e)."

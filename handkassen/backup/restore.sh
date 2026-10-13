#!/bin/sh
# ÖHTB Handkassen – Wiederherstellung aus einer Sicherung
# Aufruf (im Backup-Container, siehe BACKUP.md):
#   /bin/sh /backup/restore.sh /backups/lokal/taeglich/handkassen_JJJJMMTT_HHMMSS.tar.gz
#
# ACHTUNG: Überschreibt die aktuelle Datenbank und die Belegfotos!
# Vorher die Anwendung (Container handkassen-app der Suite) stoppen.
#
# SICHERHEITSNETZ: Vor dem Überschreiben wird automatisch eine Sicherheitskopie
# des AKTUELLEN Stands unter /backups/lokal/vor-restore/ abgelegt – im gleichen
# Format wie eine normale Sicherung. Ein versehentliches Zurückspielen lässt sich
# damit rückgängig machen (einfach diese Datei genauso zurückspielen).
set -eu

ARCHIV="${1:-}"
if [ -z "$ARCHIV" ] || [ ! -f "$ARCHIV" ]; then
  echo "Aufruf: restore.sh <pfad-zur-archivdatei.tar.gz>"
  echo "Beispiel: /bin/sh /backup/restore.sh /backups/lokal/taeglich/handkassen_20260612_020000.tar.gz"
  exit 1
fi

echo "ACHTUNG: Datenbank '$POSTGRES_DB' und Belegfotos werden aus folgender Sicherung wiederhergestellt:"
echo "  $ARCHIV"
echo "Zuvor wird automatisch eine Sicherheitskopie des aktuellen Stands erstellt."
echo "Fortfahren in 5 Sekunden – mit Strg+C abbrechen."
sleep 5

export PGPASSWORD="$POSTGRES_PASSWORD"

# ---------------------------------------------------------------------------
# 0) Sicherheitskopie des AKTUELLEN Stands (vor dem Überschreiben).
#    Gleiches Format wie eine normale Sicherung -> mit restore.sh einspielbar.
# ---------------------------------------------------------------------------
SAFE_DIR="/backups/lokal/vor-restore"
SAFE_DATEI=""
if mkdir -p "$SAFE_DIR" 2>/dev/null && [ -w "$SAFE_DIR" ]; then
  STS=$(date +%Y%m%d_%H%M%S)
  SWORK=$(mktemp -d)
  echo "Erstelle Sicherheitskopie des aktuellen Stands..."
  if pg_dump -h "${DB_HOST:-db}" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$SWORK/datenbank.dump"; then
    [ -d /uploads ] && tar czf "$SWORK/uploads.tar.gz" -C /uploads . 2>/dev/null || true
    {
      echo "Handkassen – Sicherheitskopie VOR Wiederherstellung"
      echo "Zeitpunkt:  $STS"
      echo "Datenbank:  $POSTGRES_DB"
    } > "$SWORK/INFO.txt"
    if tar czf "$SAFE_DIR/handkassen_vor-restore_${STS}.tar.gz" -C "$SWORK" .; then
      SAFE_DATEI="$SAFE_DIR/handkassen_vor-restore_${STS}.tar.gz"
      echo "  Sicherheitskopie: $SAFE_DATEI"
    else
      echo "  HINWEIS: Sicherheitskopie konnte nicht gebündelt werden – fahre dennoch fort."
    fi
  else
    echo "  HINWEIS: Aktueller Stand konnte nicht gesichert werden (Datenbank evtl. leer) – fahre dennoch fort."
  fi
  rm -rf "$SWORK"
else
  echo "HINWEIS: /backups/lokal ist nicht beschreibbar – keine Sicherheitskopie möglich, übersprungen."
fi

# ---------------------------------------------------------------------------
# Eigentliche Wiederherstellung
# ---------------------------------------------------------------------------
WORK=$(mktemp -d)
tar xzf "$ARCHIV" -C "$WORK"

# 1) Datenbank zurückspielen (vorhandene Objekte werden ersetzt)
echo "Datenbank wird wiederhergestellt..."
pg_restore -h "${DB_HOST:-db}" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --clean --if-exists --no-owner "$WORK/datenbank.dump"

# 2) Belegfotos zurückspielen (nur wenn /uploads beschreibbar eingebunden ist)
if [ -f "$WORK/uploads.tar.gz" ]; then
  if [ -w /uploads ]; then
    echo "Belegfotos werden nach /uploads entpackt..."
    tar xzf "$WORK/uploads.tar.gz" -C /uploads
  else
    echo "HINWEIS: /uploads ist nicht beschreibbar eingebunden – Belegfotos NICHT wiederhergestellt."
    echo "Siehe BACKUP.md (Wiederherstellung mit beschreibbarem uploads-Volume)."
  fi
fi

rm -rf "$WORK"
echo "Wiederherstellung abgeschlossen. Anwendung wieder starten."
if [ -n "$SAFE_DATEI" ]; then
  echo "Rückgängig machen? Die Sicherheitskopie des vorherigen Stands liegt hier:"
  echo "  $SAFE_DATEI"
  echo "Sie lässt sich mit restore.sh genauso zurückspielen."
fi

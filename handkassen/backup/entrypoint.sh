#!/bin/sh
# ÖHTB Handkassen – Backup-Dienst (datenbankgesteuert)
# Liest Zeitplan und Einstellungen aus der Tabelle "backup_konfig", führt die
# Sicherung planmäßig oder auf Anforderung ("Jetzt sichern") aus und meldet
# Status/Bericht in dieselbe Tabelle zurück. Gesteuert über den Admin-Tab
# "Datensicherung".
set -u

# Direktaufruf (Suite-Root):  docker compose --profile produktion exec handkassen-backup /bin/sh /backup/backup.sh
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

export PGPASSWORD="$POSTGRES_PASSWORD"
PSQL="psql -h ${DB_HOST:-db} -U ${POSTGRES_USER} -d ${POSTGRES_DB} -tA"

sql()     { $PSQL -c "$1" 2>/dev/null; }
sql_row() { $PSQL -F'|' -c "$1" 2>/dev/null; }
esc()     { printf '%s' "$1" | sed "s/'/''/g"; }   # einfache Anführungszeichen für SQL verdoppeln
einzeile() { sql "UPDATE backup_konfig SET $1 WHERE id=(SELECT id FROM backup_konfig ORDER BY id LIMIT 1);" >/dev/null; }

# Übersicht der Ablageorte zusammenstellen und als Bericht speichern
status_schreiben() {
  B="Stand: $(date '+%Y-%m-%d %H:%M')\n"
  for ORT in lokal nas usb; do
    P="/backups/$ORT"
    if [ ! -d "$P" ]; then
      B="${B}\n[$ORT] nicht eingebunden"
      continue
    fi
    BEREIT="ja"
    case "$ORT" in
      nas|usb) [ -f "$P/.ziel-ok" ] || BEREIT="nein (.ziel-ok fehlt)" ;;
    esac
    T=$(ls -1 "$P/taeglich/"handkassen_*.tar.gz 2>/dev/null | wc -l | tr -d ' ')
    M=$(ls -1 "$P/monatlich/"handkassen_*.tar.gz 2>/dev/null | wc -l | tr -d ' ')
    J=$(ls -1 "$P/jaehrlich/"handkassen_*.tar.gz 2>/dev/null | wc -l | tr -d ' ')
    NEU=$(ls -1t "$P/taeglich/"handkassen_*.tar.gz 2>/dev/null | head -n1)
    [ -n "$NEU" ] && NEU=$(basename "$NEU")
    B="${B}\n[$ORT] bereit: $BEREIT | taeglich: $T, monatlich: $M, jaehrlich: $J | neueste: ${NEU:-keine}"
  done
  einzeile "bericht='$(esc "$(printf '%b' "$B")")'"
}

echo "Backup-Dienst gestartet – warte auf Datenbank..."
until pg_isready -h "${DB_HOST:-db}" -U "${POSTGRES_USER}" >/dev/null 2>&1; do
  sleep 3
done

# Sicherstellen, dass genau eine Konfigzeile existiert (Standardwerte)
sql "INSERT INTO backup_konfig (uhrzeit) SELECT '02:00' WHERE NOT EXISTS (SELECT 1 FROM backup_konfig);" >/dev/null

status_schreiben
echo "Backup-Dienst bereit."

while true; do
  ROW=$(sql_row "SELECT uhrzeit, aufbewahrung_taeglich, aufbewahrung_monatlich, ziel_nas_aktiv, ziel_usb_aktiv, lauf_angefordert, COALESCE(to_char(letzter_lauf_am,'YYYY-MM-DD'),'') FROM backup_konfig ORDER BY id LIMIT 1;")

  if [ -n "$ROW" ]; then
    UHRZEIT=$(echo "$ROW" | cut -d'|' -f1)
    AUFB_T=$(echo "$ROW"  | cut -d'|' -f2)
    AUFB_M=$(echo "$ROW"  | cut -d'|' -f3)
    NAS=$(echo "$ROW"     | cut -d'|' -f4)
    USB=$(echo "$ROW"     | cut -d'|' -f5)
    ANG=$(echo "$ROW"     | cut -d'|' -f6)
    LETZT=$(echo "$ROW"   | cut -d'|' -f7)

    HM=$(date +%H:%M)
    HEUTE=$(date +%Y-%m-%d)

    LAUF=0
    [ "$ANG" = "t" ] && LAUF=1
    if [ "$HM" = "$UHRZEIT" ] && [ "$LETZT" != "$HEUTE" ]; then LAUF=1; fi

    if [ "$LAUF" = "1" ]; then
      echo "[$(date)] Starte Sicherung..."
      AUSGABE=$(ZIEL_NAS_AKTIV="$NAS" ZIEL_USB_AKTIV="$USB" \
                AUFBEWAHRUNG_TAEGLICH="$AUFB_T" AUFBEWAHRUNG_MONATLICH="$AUFB_M" \
                /bin/sh /backup/backup.sh 2>&1)
      ERG=$?
      echo "$AUSGABE"

      if [ "$ERG" = "0" ]; then
        ERF="true";  MELD="Sicherung erfolgreich ($(date '+%Y-%m-%d %H:%M'))"
      else
        ERF="false"; MELD="Sicherung FEHLGESCHLAGEN ($(date '+%Y-%m-%d %H:%M'))"
      fi
      einzeile "lauf_angefordert=false, letzter_lauf_am=now(), letzter_erfolg=$ERF, letzte_meldung='$(esc "$MELD")'"
      status_schreiben
    fi
  fi

  sleep 20
done

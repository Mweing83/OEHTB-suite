# Datensicherung (Backup)

Sichert die **Datenbank** (alle Buchungen, Stammdaten, Audit-Log) und die
**Belegfotos** (`uploads`) automatisch und verteilt jede Sicherung auf mehrere
Orte (lokal, NAS, USB) – nach dem Prinzip „mehrere Kopien an mehr als einem Ort".

Umgesetzt als eigener Dienst `backup` in der `docker-compose.yml`. Er nutzt
dasselbe PostgreSQL-Image wie die Datenbank (damit `pg_dump`/`pg_restore` exakt
zur Version passen). Er liest Zeitplan und Einstellungen aus der Datenbank und
wird über den Admin-Tab **„Datensicherung“** gesteuert (Uhrzeit, Aufbewahrung,
aktive Ziele, Knopf „Jetzt sichern“, Statusanzeige).

## Was passiert bei jeder Sicherung

1. Datenbank-Dump (`pg_dump`, Custom-Format) wird erstellt.
2. Der `uploads`-Ordner (Belegfotos) wird eingepackt.
3. Beides wird zu einem Archiv `handkassen_JJJJMMTT_HHMMSS.tar.gz` gebündelt.
4. Das Archiv wird auf alle bereiten Ablageorte kopiert (`lokal`, `nas`, `usb`),
   jeweils in den Unterordner `taeglich/`.
5. Am 1. des Monats kommt zusätzlich eine Kopie nach `monatlich/`,
   am 1. Jänner zusätzlich nach `jaehrlich/`.
6. Alte Stände werden aufgeräumt: standardmäßig 14 Tages- und 12 Monatsstände;
   **Jahresstände bleiben dauerhaft** (für die 7-jährige Aufbewahrungspflicht).

Zeitplan, Aufbewahrung und aktive Ziele (NAS/USB) werden im Admin-Tab
„Datensicherung“ verwaltet und in der Datenbank gespeichert. In der `.env` stehen
nur die Ablage-**Pfade** (`BACKUP_LOKAL`, `BACKUP_NAS`, `BACKUP_USB`,
`BACKUP_UPLOADS_SRC`), da sie am Server fest eingehängt sind.

## Einrichtung am Server (Produktivbetrieb)

1. In der `.env` die echten Pfade eintragen, z. B.:
   ```
   BACKUP_NAS=/mnt/nas/handkassen-backup
   BACKUP_USB=/mnt/usb/handkassen-backup
   BACKUP_UPLOADS_SRC=belege_data
   ```
2. NAS und USB am Server einbinden (mounten), sodass die obigen Pfade existieren.
3. **Wichtig:** In jedem dieser Ziele einmalig eine leere Markierungsdatei
   `.ziel-ok` anlegen:
   ```
   touch /mnt/nas/handkassen-backup/.ziel-ok
   touch /mnt/usb/handkassen-backup/.ziel-ok
   ```
   Fehlt sie, wird das Ziel übersprungen (Schutz davor, dass bei einem nicht
   eingebundenen Laufwerk unbemerkt ins Leere gesichert wird).
4. Produktivbetrieb inklusive Backup starten:
   ```
   docker compose --profile produktion up -d
   ```

Die Zugriffsrechte auf NAS-Freigabe und USB sollten beschränkt sein, da die
Belege dort unverschlüsselt liegen.

## Lokaler Test (jetzt, auf dem Entwicklungsrechner)

So prüfst du, dass die Mechanik funktioniert, bevor der echte Server steht.
Docker Desktop muss laufen.

1. Datenbank starten (falls nicht schon laufend):
   ```
   docker compose up -d db
   ```
2. Eine Sicherung einmalig ausführen:
   ```
   docker compose --profile produktion run --rm backup /bin/sh /backup/backup.sh
   ```
3. Ergebnis ansehen: im Ordner `backups/lokal/taeglich/` sollte jetzt eine Datei
   `handkassen_*.tar.gz` liegen.

NAS und USB werden lokal übersprungen (keine `.ziel-ok`-Datei). Wenn du auch das
Kopieren testen willst, lege die Markierungen an und starte erneut:
```
New-Item -ItemType File ./backups-nas/.ziel-ok -Force
New-Item -ItemType File ./backups-usb/.ziel-ok -Force
```

## Steuerung über die Oberfläche

Im Admin-Bereich gibt es den Tab **„Datensicherung“**:
- **Status:** letzte Sicherung (Zeitpunkt/Erfolg) und eine Übersicht der
  Ablageorte (bereit ja/nein, Anzahl vorhandener Stände).
- **Einstellungen:** Uhrzeit des täglichen Laufs, Aufbewahrung (Tage/Monate),
  welche Ziele aktiv sind (NAS/USB).
- **„Jetzt sichern“:** löst eine sofortige Sicherung aus (läuft binnen ~30 s).

Damit der Tab funktioniert, muss die Datenbank-Tabelle vorhanden sein. Beim
Einspielen dieser Version daher einmalig die Migration anwenden:
```
cd backend
npx prisma migrate dev --name backup_konfig
```
(Fügt nur eine neue Tabelle hinzu – kein Zurücksetzen der Daten nötig.)

## Läuft die Sicherung? (Überwachung)

- Protokoll: `backups/lokal/backup.log`
- Letzter Erfolg: `backups/lokal/LETZTER_ERFOLG.txt` (enthält den Zeitstempel der
  letzten erfolgreichen Sicherung).

## Wiederherstellung (Restore)

> Überschreibt die aktuelle Datenbank und die Belegfotos. Vorher die Anwendung
> stoppen. Im Zweifel zuerst an einer Testumgebung üben.
>
> **Sicherheitsnetz:** Bevor überschrieben wird, legt das Restore-Skript
> automatisch eine Sicherheitskopie des AKTUELLEN Stands unter
> `backups/vor-restore/` ab (gleiches Format wie eine normale Sicherung). Ein
> versehentliches Zurückspielen lässt sich damit rückgängig machen, indem du
> diese `handkassen_vor-restore_*.tar.gz`-Datei genauso zurückspielst.

Am Server, im Projektordner:

```
# 1) Anwendung stoppen
docker compose --profile produktion stop app

# 2) Wiederherstellen (Datenbank + Belegfotos). Passwort aus der .env einsetzen.
docker run --rm \
  --network handkassen_default \
  -e POSTGRES_USER=handkassen \
  -e POSTGRES_PASSWORD=DEIN_DB_PASSWORT \
  -e POSTGRES_DB=handkassen \
  -e DB_HOST=db \
  -v handkassen_belege_data:/uploads \
  -v "$(pwd)/backup:/backup:ro" \
  -v "$(pwd)/backups:/backups/lokal" \
  postgres:16-alpine /bin/sh /backup/restore.sh \
  /backups/lokal/taeglich/handkassen_JJJJMMTT_HHMMSS.tar.gz

# 3) Anwendung wieder starten
docker compose --profile produktion start app
```

Hinweise:
- Netzwerk- und Volume-Name (`handkassen_default`, `handkassen_belege_data`)
  ergeben sich aus dem Projektordnernamen. Prüfen mit `docker network ls` bzw.
  `docker volume ls`, falls abweichend.
- Liegt die gewünschte Sicherung auf NAS/USB statt lokal, den Pfad in der
  `-v ...:/backups/lokal`-Zeile entsprechend auf den NAS-/USB-Ordner setzen.

## Empfehlung

Den Rückspiel-Vorgang einmal echt durchspielen und danach etwa monatlich kurz
prüfen, dass aktuelle Sicherungen vorhanden sind. Eine Sicherung, die nie
zurückgespielt wurde, ist nur eine Hoffnung.

# Datensicherung (Backup)

Sichert die **Datenbank** (alle Buchungen, Stammdaten, Audit-Log) und die
**Belegfotos** (`uploads`) automatisch und verteilt jede Sicherung auf mehrere
Orte (lokal, NAS, USB) – nach dem Prinzip „mehrere Kopien an mehr als einem Ort".

Umgesetzt als Dienst `handkassen-backup` in der `docker-compose.yml` der Suite
(Suite-Root); die Skripte liegen in `handkassen/backup/`. Er nutzt
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
„Datensicherung“ verwaltet und in der Datenbank gespeichert. In der `.env` der
Suite stehen nur die Ablage-**Pfade** (`BACKUP_LOKAL`, `BACKUP_NAS`, `BACKUP_USB`),
da sie am Server fest eingehängt sind.

## Einrichtung am Server (Produktivbetrieb)

1. In der `.env` im Suite-Root die echten Pfade eintragen, z. B.:
   ```
   BACKUP_NAS=/mnt/nas/handkassen-backup
   BACKUP_USB=/mnt/usb/handkassen-backup
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
4. Suite inklusive Backup starten (im Suite-Root):
   ```
   docker compose --profile produktion up -d
   ```
   oder `SERVER - Starten.bat`.

Die Zugriffsrechte auf NAS-Freigabe und USB sollten beschränkt sein, da die
Belege dort unverschlüsselt liegen.

## Sicherung sofort ausführen (ohne auf den Zeitplan zu warten)

Entweder im Admin-Tab „Datensicherung“ auf **„Jetzt sichern“** klicken, oder im
Suite-Root:
```
docker compose --profile produktion exec handkassen-backup /bin/sh /backup/backup.sh
```
Ergebnis: im Ordner `handkassen/backups/taeglich/` (bzw. `BACKUP_LOKAL`) liegt
eine neue Datei `handkassen_*.tar.gz`. NAS und USB werden übersprungen, solange
dort keine `.ziel-ok`-Datei liegt.

## Steuerung über die Oberfläche

Im Admin-Bereich gibt es den Tab **„Datensicherung“**:
- **Status:** letzte Sicherung (Zeitpunkt/Erfolg) und eine Übersicht der
  Ablageorte (bereit ja/nein, Anzahl vorhandener Stände).
- **Einstellungen:** Uhrzeit des täglichen Laufs, Aufbewahrung (Tage/Monate),
  welche Ziele aktiv sind (NAS/USB).
- **„Jetzt sichern“:** löst eine sofortige Sicherung aus (läuft binnen ~30 s).

## Läuft die Sicherung? (Überwachung)

- Protokoll: `handkassen/backups/backup.log`
- Letzter Erfolg: `handkassen/backups/LETZTER_ERFOLG.txt` (enthält den Zeitstempel
  der letzten erfolgreichen Sicherung).
- Zusätzlich zieht `SERVER - Aktualisieren.bat` vor jedem Update einen `pg_dump`
  aller Suite-Datenbanken nach `backups-vor-update\` (siehe `../INSTALL.md`).

## Wiederherstellung (Restore)

> Überschreibt die aktuelle Datenbank und die Belegfotos. Vorher die Anwendung
> stoppen. Im Zweifel zuerst an einer Testumgebung üben.
>
> **Sicherheitsnetz:** Bevor überschrieben wird, legt das Restore-Skript
> automatisch eine Sicherheitskopie des AKTUELLEN Stands unter
> `backups/vor-restore/` ab (gleiches Format wie eine normale Sicherung). Ein
> versehentliches Zurückspielen lässt sich damit rückgängig machen, indem du
> diese `handkassen_vor-restore_*.tar.gz`-Datei genauso zurückspielst.

Am Server, im Suite-Root (der Backup-Container hat Datenbank, Belege-Volume und
alle Ablageorte bereits eingebunden; das Belege-Volume ist dort nur lesend
gemountet, deshalb wird für den Restore ein eigener Container gestartet):

```
# 1) Anwendung stoppen (Backup-Dienst darf weiterlaufen)
docker compose --profile produktion stop handkassen-app

# 2) Wiederherstellen (Datenbank + Belegfotos). Passwort = HK_DB_PASSWORD aus der .env.
docker run --rm `
  --network oehtb-suite_default `
  -e POSTGRES_USER=handkassen `
  -e POSTGRES_PASSWORD=DEIN_DB_PASSWORT `
  -e POSTGRES_DB=handkassen `
  -e DB_HOST=handkassen-db `
  -v handkassen_belege_data:/uploads `
  -v "${PWD}\handkassen\backup:/backup:ro" `
  -v "${PWD}\handkassen\backups:/backups/lokal" `
  postgres:16-alpine /bin/sh /backup/restore.sh `
  /backups/lokal/taeglich/handkassen_JJJJMMTT_HHMMSS.tar.gz

# 3) Anwendung wieder starten
docker compose --profile produktion start handkassen-app
```

Hinweise:
- Netzwerkname `oehtb-suite_default` und Volume `handkassen_belege_data` prüfen
  mit `docker network ls` bzw. `docker volume ls`, falls abweichend.
- Liegt die gewünschte Sicherung auf NAS/USB statt lokal, den Pfad in der
  `-v ...:/backups/lokal`-Zeile entsprechend auf den NAS-/USB-Ordner setzen.
- **Niemals** eine zweite PostgreSQL-Instanz auf das Volume `handkassen_db_data`
  starten (Datenverlust). Der Restore geht immer über die laufende `handkassen-db`.

## Probe-Wiederherstellung (Feuerprobe)

Damit man nicht erst im Ernstfall merkt, ob eine Sicherung taugt, gibt es eine
**gefahrlose Probe-Wiederherstellung**: Sie spielt die neueste Sicherung in eine
**Wegwerf-Datenbank** ein, prüft, ob Tabellen und Buchungen ankommen, und löscht
die Wegwerf-Datenbank danach wieder. Die echte Datenbank und die Belegfotos
werden dabei **nicht angefasst** – der Test ist jederzeit im laufenden Betrieb
möglich.

Am Server, im Projektordner der Suite:

```
# Neueste tägliche Sicherung testen:
docker compose --profile produktion exec handkassen-backup \
  /bin/sh /backup/restore-test.sh

# Oder eine bestimmte Sicherung testen:
docker compose --profile produktion exec handkassen-backup \
  /bin/sh /backup/restore-test.sh \
  /backups/lokal/taeglich/handkassen_JJJJMMTT_HHMMSS.tar.gz
```

Erwartete letzte Zeile: `PROBE-WIEDERHERSTELLUNG ERFOLGREICH – die Sicherung ist
brauchbar.` Erscheint stattdessen `FEHLGESCHLAGEN`, ist die Sicherung defekt –
dann Ursache prüfen (Ablageort voll? Archiv unvollständig?).

## Empfehlung

Den Rückspiel-Vorgang einmal echt durchspielen und danach etwa monatlich die
Probe-Wiederherstellung (oben) laufen lassen sowie kurz prüfen, dass aktuelle
Sicherungen vorhanden sind. Eine Sicherung, die nie zurückgespielt wurde, ist
nur eine Hoffnung.

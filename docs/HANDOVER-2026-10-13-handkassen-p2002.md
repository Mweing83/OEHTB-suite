# Handover: Handkassen „Interner Serverfehler“ beim Anlegen (P2002) – Produktivserver

Stand: **2026-10-13, ca. 13:15 Uhr (MESZ), Status: BEHOBEN.**
Ursprünglich auf dem Entwicklungsrechner erstellt (Abschnitte 0–10 = Diagnoseplan),
danach auf dem Produktivserver `C:\OEHTB\OEHTB-suite` von Claude Code abgearbeitet und
ergänzt (Abschnitte A–H). **Wer nur den aktuellen Stand braucht: Abschnitte A–H lesen.**

Zeiten: Docker-/Postgres-Logs sind UTC, Windows-Dateizeiten MESZ (UTC+2).
10:19 UTC = 12:19 MESZ.

---

## A. Kurzfassung

- **Ursache:** Beim Update (Neuerstellen des Containers `handkassen-db` um 10:19:54 UTC)
  ist im Datenverzeichnis der Handkassen-DB der WAL-/Transaktionsstand (`pg_control`,
  WAL, Transaktions-IDs) **zurückgesprungen, die Tabellendateien aber nicht**. Folge:
  Die Buchungen 2–15 lagen physisch noch in der Tabelle und im Unique-Index, waren für
  normale Abfragen (MVCC) aber unsichtbar. Die App sah 1 Buchung, vergab Nummer 2, und
  der Unique-Index meldete „Key (buchungsnummer)=(2) already exists“ → P2002.
  Gleiches Muster beim Seed (`bereich_konto` → Konto 23 „nicht vorhanden“).
- **Nicht** die Ursache: der Code von `510699f` (Bearbeiten), der App-Code allgemein, die
  Migrationen, eine falsche DB-Verbindung (H1), eine zweite Postgres-Instanz am Volume (H3).
- **Wahrscheinlich nicht** die Ursache: der neue `x-db-pw-sync-entrypoint` (macht nur
  `ALTER USER … PASSWORD`, siehe C.7).
- **Eigentliche Ursache (nachträglich gefunden, Abschnitt G.2):** Von ca. 10:07 bis 10:19 UTC
  lief der **alte Standalone-Handkassen-Stack aus dem Unterordner `handkassen\`** parallel zur
  Suite. Seine DB nutzt **dasselbe Volume `handkassen_db_data`** → zwei Postgres-Instanzen
  schrieben gleichzeitig in ein Datenverzeichnis. **Im Ordner `handkassen\` keine Skripte mehr starten!**
- **Reparatur:** App + Backup gestoppt, defektes Volume bitgleich gesichert, Volume
  `handkassen_db_data` neu angelegt, **Backup von heute 04:00 MESZ** (`handkassen_20261013_020011`)
  per `pg_restore` eingespielt, App + Backup wieder gestartet.
- **Ergebnis:** 15 Buchungen (Nr. 1–15) wieder da, App sieht `_count: 15, max: 15`,
  Seed läuft ohne Fehler, Checkpoint läuft, keine DB-Fehler im Log.
  **Offen:** Eine Testbuchung über die Oberfläche durch Michael (sollte Nr. 16 werden).
- **Datenverlust:** Laut Audit-Log und Backup-Inhalt wurde zwischen 30.09. und dem Update
  nichts Fachliches eingegeben → kein Verlust erkennbar. Die heute bei den gescheiterten
  Speicherversuchen hochgeladenen **Belege (3 Stück)** existieren nur noch als verwaiste
  Dateien im Volume `handkassen_belege_data`; diese Buchungen müssen neu erfasst werden.

---

## B. Chronologie (13.10.2026, UTC)

| Zeit (UTC) | Ereignis |
|---|---|
| 02:00 | Nächtliches Backup `handkassen_20261013_020011.tar.gz` (enthält 15 Buchungen, sauber) |
| 10:19:53 | Alter `handkassen-db`-Container heruntergefahren („database system was shut down at 10:19:53“) |
| 10:19:54 | Neuer `handkassen-db`-Container (neuer Entrypoint) startet, **kein** Recovery-Lauf, `pg_control` zuletzt geändert 10:19:54 |
| 10:19:55 | `[pw-sync] DB-Passwort an POSTGRES_PASSWORD (.env) angeglichen.` |
| 10:21–10:26 | Mehrere `duplicate key value violates unique constraint "buchung_buchungsnummer_key" / Key (buchungsnummer)=(2) already exists` |
| 10:22:42 | `handkassen-app` neu gestartet; Seed: `bereich_konto_kontoId_fkey … Key (kontoId)=(23) is not present in table "konto"` → „Seed uebersprungen“ |
| ab 10:24:55 | Jeder Checkpoint scheitert: `xlog flush request 0/1BBC2B8 is not satisfied --- flushed only to 0/1B66ED8` / `could not write block 0 of base/16384/16470` |
| ~10:52 | Diagnose durch Claude Code auf dem Server (Abschnitt C) |
| ~10:55 | `handkassen-app` und `handkassen-backup` gestoppt |
| ~10:57 | Dump des defekten Zustands gezogen; `handkassen-db` gestoppt |
| 10:58:55 | Volume `handkassen_db_data_defekt_20261013` angelegt, bitgleiche Kopie (1361 Dateien, 47,2 MB, md5 identisch) |
| ~11:00 | Michael: `docker compose --profile produktion rm -f handkassen-db` + `docker volume rm handkassen_db_data` (manuell, Claude durfte nicht löschen) |
| 11:00:43 | Neues Volume `handkassen_db_data`, frisches initdb, DB healthy |
| ~11:01 | `pg_restore` des 04:00-Backups, Exit 0 |
| 11:01:32 | `handkassen-app` + `handkassen-backup` gestartet, App healthy, Seed ok |
| ~11:03 | Prüfung: App sieht 15 Buchungen, `CHECKPOINT` ohne Fehler |

---

## C. Diagnose-Ergebnisse (Abschnitt 7 des ursprünglichen Plans)

1. **7.1 DATABASE_URL der App:** `postgresql://handkassen:***@handkassen-db:5432/handkassen`
   → richtiger Host/DB. **H1 ausgeschlossen.**
2. **7.2 Container/Volumes:** Kein alter Standalone-Handkassen-Postgres läuft. Nur
   `oehtb-suite-handkassen-db-1` mountet `handkassen_db_data` (`docker ps -a --filter volume=…`).
   `handkassen-backup` mountet die DB **nicht** (eigenes anonymes Volume für sein pgdata).
   **H3 ausgeschlossen.**
3. **7.3 xmin:** einzige sichtbare Zeile `ctid (0,2), xmin 1002, xmax 0`, `txid_current()` 1153,
   `pg_controldata` NextXID 0:1117, oldestXID 723, nur ein WAL-Segment
   `000000010000000000000001` (seit 26.06.), Latest checkpoint 0/1B65010.
   Die *sichtbare* Zeile ist also unauffällig – das Problem sind die *unsichtbaren*.
4. **7.5 Sicht der App (Prisma, über stdin ausgeführt):** `{ _max: { buchungsnummer: 1 }, _count: 1 }`,
   `current_schema = public`, `current_database = handkassen` → App und psql sehen dasselbe.
   Kein Schema-Problem (nur `public.buchung` existiert, `search_path = "$user", public`).
5. **Keine** Trigger, Rules oder RLS auf `buchung`. Indizes normal
   (`buchung_buchungsnummer_key`, `buchung_pkey`, `buchung_belegId_key`,
   `buchung_kostenstelleId_idx`, `buchung_kostenstelleId_belegJahr_belegLaufnummer_key`).
6. **Entscheidender Befund (Index-Only-Scan, `enable_seqscan=off`):**
   - `buchung_buchungsnummer_key`: **Heap Fetches 18**, sichtbar 1 Zeile
   - `buchung_pkey`: **Heap Fetches 40**, sichtbar 1 Zeile
   - `buchung_id_seq.last_value = 40`, `audit_log_id_seq = 120` bei max(id) 95
   - `pg_stat_user_tables` buchung: n_tup_ins 22, n_dead_tup 22 (= gescheiterte Inserts seit Start)
   → Im Index stehen Buchungsnummern, deren Zeilen für MVCC unsichtbar, für die
   Unique-Prüfung (Dirty Snapshot) aber „lebendig“ sind.
7. **DB-Log beweist den Zeitsprung:** `xlog flush request 0/1BBC2B8 is not satisfied ---
   flushed only to 0/1B66ED8` → Datenseiten tragen eine LSN *hinter* dem WAL-Ende, d. h.
   Datenseiten sind neuer als WAL/`pg_control`. Checkpoints scheiterten dauerhaft.
   Der Entrypoint (`docker-compose.yml`, Anker `x-db-pw-sync-entrypoint`, Z. 31–47) wartet nur
   auf `pg_isready`, führt `ALTER USER … PASSWORD` aus und `exec docker-entrypoint.sh postgres`
   – kein initdb (Log: „Database directory appears to contain a database; Skipping initialization“),
   kein `pg_resetwal`.
8. **Backups geprüft** (Inhalt per `pg_restore -a` in Wegwerf-Container `postgres:16-alpine`):
   `handkassen_20261001_020008` und `handkassen_20261013_020011` enthalten beide
   **15 Buchungen** (Nr. 1–15, ids 1–15; Buchungen 2–15 vom 30.09.2026 07:42–07:59,
   Kostenstelle 3, Ersteller 6). Inhalt des 04:00-Backups: `_prisma_migrations` 20,
   abschluss 0, allgemein_konfig 1, audit_log 86, backup_konfig 1, beleg 0, benutzer 6,
   benutzer_kostenstelle 5, bereich 5, bereich_konto 100, buchung 15, buchungsposition 15,
   kassenart 3, konto 27, kostenstelle 3, monats_sperre 1, steuersatz 5.
   `uploads.tar.gz` im Backup ist leer (86 Byte) – es gab keine Belege.

**Wichtig für die Zukunft:** Der Weg aus dem alten Abschnitt 8 („pg_dump der aktuellen DB,
dann Restore“) hätte **Daten verloren** – ein `pg_dump` sieht die unsichtbaren Zeilen
genauso wenig. Bei diesem Fehlerbild immer das letzte Backup *vor* dem Ereignis nehmen.

---

## D. Durchgeführte Reparatur (mit Michaels Freigabe)

```powershell
# 1. Schreibzugriffe stoppen (auch, damit das Nacht-Backup kein gutes Backup verdrängt)
docker compose --profile produktion stop handkassen-app handkassen-backup

# 2a. Dump des defekten Zustands (nur zur Referenz, enthält nur Buchung 1 + 3 heutige Belege)
docker compose --profile produktion exec handkassen-db pg_dump -U handkassen -d handkassen -F c -f /tmp/hk-defekt-zustand.dump
docker compose --profile produktion cp handkassen-db:/tmp/hk-defekt-zustand.dump <SICHER-Ordner>\hk-defekt-zustand-1019.dump

# 2b. DB stoppen, Volume bitgleich kopieren und per md5 verifizieren
docker compose --profile produktion stop handkassen-db
docker volume create handkassen_db_data_defekt_20261013
docker run --rm -v handkassen_db_data:/von:ro -v handkassen_db_data_defekt_20261013:/nach alpine sh -c 'cp -a /von/. /nach/ && …md5-Vergleich…'
#   → 1361/1361 Dateien, KOPIE_IDENTISCH, 47.2M

# 3. (manuell durch Michael) Container + defektes Volume entfernen
docker compose --profile produktion rm -f handkassen-db
docker volume rm handkassen_db_data

# 3b. Frische DB + Restore des 04:00-Backups
docker compose --profile produktion up -d --no-deps handkassen-db
docker compose --profile produktion cp <…>\datenbank.dump handkassen-db:/tmp/restore.dump
docker compose --profile produktion exec handkassen-db pg_restore -U handkassen -d handkassen --no-owner --exit-on-error /tmp/restore.dump   # Exit 0

# 4. Wieder starten
docker compose --profile produktion up -d --no-deps handkassen-app handkassen-backup
```

Prüfungen danach:
- psql: buchung 15 / max 15, konto 27, bereich_konto 100, `_prisma_migrations` 20,
  `buchung_id_seq` 15.
- App-Log: „20 migrations found … No pending migrations to apply.“, Seed „22 Konten
  angelegt/aktualisiert.“, **kein** „Seed uebersprungen“, kein P2002.
- App via Prisma: `{ _max: { buchungsnummer: 15 }, _count: 15 }`.
- `CHECKPOINT;` ohne Fehler, keine `ERROR`/`xlog`-Zeilen im DB-Log.
- Hinweis `/tmp/restore.dump` und `/tmp/hk-defekt-zustand.dump` liegen noch in den Containern
  (verschwinden beim nächsten Neuerstellen).

---

## E. Aufbewahrte Sicherungen – NICHT löschen, bis alles einige Tage stabil läuft

| Was | Wo | Bemerkung |
|---|---|---|
| Gutes Backup 04:00 | `C:\OEHTB\OEHTB-suite\handkassen\backups\SICHER_vor_Reparatur_20261013\handkassen_20261013_020011.tar.gz` | 16 238 Byte, SHA256 `932EFA9A4C4362430DAF012C06D28337800D8E2CB8F3C3204FE456A3BAF073AF` (identisch mit Original in `backups\taeglich\`) |
| Dump defekter Zustand | `…\SICHER_vor_Reparatur_20261013\hk-defekt-zustand-1019.dump` | 55 679 Byte, pg_dump -Fc, sieht nur Buchung 1 + 3 Belege von heute |
| Defektes Datenverzeichnis | Docker-Volume `handkassen_db_data_defekt_20261013` | bitgleiche Kopie des alten `handkassen_db_data` nach dem Zeitsprung, für Ursachenanalyse (G) |
| Entpackte Backups | Claude-Scratchpad (temporär, unwichtig) | – |

Der Ordner `SICHER_vor_Reparatur_20261013` liegt innerhalb von `BACKUP_LOKAL`; das
Rotationsskript räumt nur `taeglich/`, `monatlich/` – vor Aufräumarbeiten trotzdem prüfen.

---

## F. Ist-Zustand Produktivserver (zum Abgleich mit dem Entwicklungsrechner)

### F.1 Repo
- Pfad `C:\OEHTB\OEHTB-suite`, Branch `main`, Arbeitsbaum **sauber** (`git status` leer, auch
  nach der Reparatur; der Ordner `SICHER_vor_Reparatur_20261013` ist über
  `handkassen/.gitignore:7 backups/` ausgeschlossen).
- HEAD `510699f`. Letzte Commits:
  `510699f` Bearbeiten statt Storno · `cd14e7c` Tailscale-HTTPS · `4ce2612` Server-Härtung ·
  `4ee6581` DB-Passwort-Sync · `b1719e6` Steuersätze löschen · `2a07144` / `d3383d9`
  Start-Belegnummer · `78e831e` / `c2be923` / `1293d86` dezimale Steuersätze ·
  `b9d28e6` Umsetzungsplan · `219a919` Spec.

### F.2 Docker
- Docker Client/Server **29.5.3**, Docker Compose **v5.1.4**, Docker Desktop (WSL2, Pfade
  `/run/desktop/mnt/host/c/…`). Netzwerk `oehtb-suite_default` (bridge).

### F.3 Container (Stand 13.10. ~13:10 MESZ)

| Container | Image | Image-ID (sha256, gekürzt) | Gestartet (UTC) | Ports |
|---|---|---|---|---|
| oehtb-suite-handkassen-db-1 | postgres:16-alpine | e013e867e712 | 2026-10-13 11:00:43 | 5432/tcp intern |
| oehtb-suite-handkassen-app-1 | oehtb-suite-handkassen-app (lokal gebaut, Stand 510699f) | d2cee3f477ba | 2026-10-13 11:01:32 | 3001/tcp intern |
| oehtb-suite-handkassen-backup-1 | postgres:16-alpine | e013e867e712 | 2026-10-13 11:01:32 | – |
| oehtb-suite-stunden-app-1 | oehtb-suite-stunden-app | e6af4d723fbd | 2026-10-13 10:22:42 | 3002/tcp intern |
| oehtb-suite-stunden-db-1 | postgres:16 (Debian) | 33f923b05f64 | 2026-10-13 10:19:54 | 5432/tcp intern |
| oehtb-suite-foerderungen-app-1 | oehtb-suite-foerderungen-app | 3e536cf0ee49 | 2026-10-13 10:22:42 | 3003/tcp intern |
| oehtb-suite-foerderungen-db-1 | postgres:16 (Debian) | 33f923b05f64 | 2026-10-13 10:19:54 | 5432/tcp intern |
| oehtb-suite-portal-app-1 | oehtb-suite-portal-app | 6e6d9ce93a02 | 2026-10-13 10:22:42 | 3000/tcp intern |
| suite-db | postgres:16-alpine | e013e867e712 | 2026-10-13 10:19:54 | 127.0.0.1:5434→5432 |
| oehtb-suite-proxy-1 | nginx:1.27-alpine | 65645c7bb6a0 | 2026-09-28 11:48:24 | 0.0.0.0:80→80 |
| sharp_varahamihira | handkassen-app:latest (alt, 483f151017f3) | – | Exited (1) seit 26.06. | Altlast, ungenutzt |

Alle Restart-Policy `unless-stopped` (außer dem Altlast-Container). Alle laufenden: healthy.

### F.4 Mounts
- handkassen-db: `handkassen_db_data` → `/var/lib/postgresql/data`
- handkassen-app: `handkassen_belege_data` → `/app/uploads`; `C:\OEHTB\OEHTB-suite\handkassen\backups` → `/backups/lokal`
- handkassen-backup: `handkassen_belege_data` → `/uploads`; anonymes Volume `371be7fd…` → `/var/lib/postgresql/data` (eigenes, ungenutztes pgdata des Backup-Containers); `handkassen\backup` → `/backup`; `handkassen\backups` → `/backups/lokal`; `handkassen\backups-nas` → `/backups/nas`; `handkassen\backups-usb` → `/backups/usb`
- stunden-db: `stunden_db_data`; foerderungen-db: `foerderungen_db_data`; suite-db: `oehtb-suite_suite_db_data`
- proxy: `C:\OEHTB\OEHTB-suite\nginx\nginx.conf` → `/etc/nginx/conf.d/default.conf`
- stunden-app, foerderungen-app, portal-app: keine Mounts

### F.5 Volumes

| Volume | Erstellt (UTC) | Compose-Projekt |
|---|---|---|
| handkassen_db_data | **2026-10-13 11:00:43 (neu)** | oehtb-suite |
| handkassen_db_data_defekt_20261013 | 2026-10-13 10:58:55 | – (manuell) |
| handkassen_belege_data | 2026-06-26 07:44:40 | **handkassen** (alt) → Compose-Warnung „created for project handkassen (expected oehtb-suite)“, harmlos; Abhilfe wäre `external: true` |
| stunden_db_data | 2026-07-31 13:46:12 | oehtb-suite |
| foerderungen_db_data | 2026-07-31 13:46:12 | oehtb-suite |
| oehtb-suite_suite_db_data | 2026-07-31 13:46:12 | oehtb-suite |
| 371be7fd… (anonym) | 2026-07-31 13:46:13 | pgdata von handkassen-backup |
| 24ac7588…, d778a520…, ea810905… (anonym) | 2026-06-26 | Altlasten der Erstinstallation, ungenutzt |

### F.6 Datenbanken (alle PostgreSQL 16.14)

| DB-Container | Image-Basis | DB / User | Migrationen | neueste 3 |
|---|---|---|---|---|
| handkassen-db | Alpine (musl) | handkassen / handkassen | 20 | 20260804111835_kostenstelle_start_belegnummer, 20260804110314_steuersatz_dezimal, 20260731085958_konto_bereich_freigabe |
| stunden-db | Debian (glibc) | stunden / stunden | 8 | 20260717130000_rollen_kleinschreibung, 20260714121000_audit_log_append_only, 20260714120000_audit_log_map |
| foerderungen-db | Debian (glibc) | foerderungen / foerderungen | 3 | 20260717130100_rolle_kleinschreibung, 20260717112446_scanart, 20260716104419_init |
| suite-db | Alpine (musl) | suite / suite | 5 | 20260717150000_zugriff_rollen_reparatur, 20260717130200_rollen_kleinschreibung, 20260714121000_audit_log_append_only |

Alle 20 Handkassen-Migrationen (Server, nach Restore):
`20260601152542_init`, `20260601195914_admin_oberflaeche`, `20260601201724_belegnummer`,
`20260602113729_korrektur`, `20260603100000_bereich_kassenart_stammdaten`,
`20260608090734_belegnummer_je_kostenstelle`, `20260608140927_backup_konfig`,
`20260610115258_kostenstelle_gegenkonto`, `20260610121909_belegnummer_jahr`,
`20260611192448_monatssperre`, `20260612082357_beleg_pflicht`,
`20260612215637_belegfoto_aufloesung`, `20260615191117_kontakt`,
`20260629123519_backup_pfade`, `20260708140000_suite_sso`,
`20260710120100_provision_tombstone`, `20260714121000_audit_log_append_only`,
`20260731085958_konto_bereich_freigabe`, `20260804110314_steuersatz_dezimal`,
`20260804111835_kostenstelle_start_belegnummer`.

Handkassen-Tabellen nach Restore + Seed (`pg_stat_user_tables.n_live_tup`, Schätzwerte):
abschluss 0, allgemein_konfig 1, audit_log 89, backup_konfig 1, beleg 0, benutzer 6,
benutzer_kostenstelle 5, bereich 5, bereich_konto 133 (100 aus Backup + Seed-Upserts),
buchung 15, buchungsposition 15, kassenart 3, konto 27, kostenstelle 3, monats_sperre 1,
steuersatz 5.

### F.7 `.env` auf dem Server (nur Schlüssel; Geheimnisse maskiert)
```
JWT_SECRET=***            PROVISION_SECRET=***
COOKIE_INSECURE=1         SESSION_TIMEOUT_MINUTEN=15
SUITE_DB_USER=suite       SUITE_DB_PASSWORD=***   SUITE_DB_NAME=suite
HK_DB_USER=handkassen     HK_DB_PASSWORD=***      HK_DB_NAME=handkassen
STUNDEN_DB_USER=stunden   STUNDEN_DB_PASSWORD=*** STUNDEN_DB_NAME=stunden   STUNDEN_ENCRYPTION_KEY=***
FOERDERUNGEN_DB_USER=foerderungen  FOERDERUNGEN_DB_PASSWORD=***  FOERDERUNGEN_DB_NAME=foerderungen  FOERDERUNGEN_ENCRYPTION_KEY=***
BACKUP_LOKAL=./handkassen/backups
BACKUP_NAS=./handkassen/backups-nas
BACKUP_USB=./handkassen/backups-usb
```
Kein eigenes `DATABASE_URL` in der `.env`; die App bekommt sie aus Compose
(`postgresql://handkassen:***@handkassen-db:5432/handkassen`).

### F.8 Backups
- Nächtlich 02:00 UTC (04:00 MESZ) nach `handkassen\backups\taeglich\`, monatlich nach
  `…\monatlich\`; `LETZTER_ERFOLG.txt` zuletzt 13.10. 04:00:11.
- Alle Tages-Backups 01.–13.10. sind ~16,2 KB groß und (stichprobenartig 01.10. + 13.10.)
  inhaltlich gleich – es gab seit 30.09. keine fachlichen Änderungen.
- Das nächste Nacht-Backup (14.10.) läuft gegen die reparierte DB.

---

## G. Offene Punkte / Empfehlungen für den Entwicklungsrechner

1. **Michael:** Testbuchung über die Oberfläche anlegen → muss Nr. 16 bekommen. Danach
   die 3 heute vergeblich erfassten Buchungen (mit Belegen) neu eingeben.
2. **Ursache: GEKLÄRT – siehe Abschnitt G.2** (zwei Postgres-Instanzen gleichzeitig auf
   `handkassen_db_data`: alter Standalone-Stack aus `handkassen\` + Suite). Die folgenden
   ursprünglichen Ideen sind damit überholt:
   - Analyse am Volume `handkassen_db_data_defekt_20261013` in einem Wegwerf-Container
     (Kopie davon!, nie das Volume selbst starten): `pg_waldump`, `pageinspect` auf
     `base/16384/16470` (Block 0, LSN der Seite), `pg_xact/0000`, Dateizeiten.
   - Prüfen, ob beim Update ein zweiter Postgres-Prozess kurzzeitig dasselbe Verzeichnis
     benutzt hat (alter und neuer Container überlappend?) oder ob Docker Desktop/WSL2 beim
     Neuerstellen Schreibvorgänge verloren hat (unsauberes Herunterfahren, `fsync`).
   - `SERVER - Aktualisieren.bat` daraufhin ansehen, wie die DB-Container neu erstellt werden
     (vorher `docker compose stop` mit ausreichendem Timeout? `stop_grace_period` für die
     DB-Services setzen, z. B. 60s).
   - **Andere DBs: am 13.10. ~13:20 MESZ geprüft, ohne Befund** (siehe Abschnitt G.1 unten).
3. **Härtung `SERVER - Aktualisieren.bat`:** vor dem Neuerstellen der DB-Container ein
   Sofort-Backup aller DBs ziehen und nach dem Start einen Plausibilitätscheck
   (Zeilenzahlen vs. Backup) machen.
4. `handkassen_belege_data` in Compose als `external: true` deklarieren (beseitigt Warnung).
5. Aufräumen später (nur nach Freigabe): Altlast-Container `sharp_varahamihira`, anonyme
   Volumes `24ac7588…`, `d778a520…`, `ea810905…`, Image `handkassen-app:latest`; nach
   einigen stabilen Tagen `handkassen_db_data_defekt_20261013` und den SICHER-Ordner.
6. Verwaiste Beleg-Dateien von heute im Volume `handkassen_belege_data` (zu `beleg`-Zeilen,
   die es nach dem Restore nicht mehr gibt) – harmlos, ggf. aufräumen.

### G.1 Prüfung der übrigen Datenbanken (13.10., nur lesend)

Alle vier DB-Container wurden um 10:19:54 UTC neu erstellt. Prüfung von `stunden-db`,
`foerderungen-db`, `suite-db` (und zur Kontrolle `handkassen-db` nach dem Restore):

1. **Logs:** Bei keiner der drei DBs `xlog flush`, `could not write block`, `ERROR`, `FATAL`,
   `PANIC`. Sauberer Start („shut down at 10:19:53“ → „ready to accept connections“), danach
   erfolgreiche Checkpoints (`checkpoint complete … lsn=…`), obwohl seit dem Neustart Seiten
   geändert wurden (stunden/foerderungen `User` je 6 Updates, suite `suite_user` 16 Updates,
   `tool` 12 Updates, `audit_log` 16 Inserts). Bei der kaputten Handkassen-DB scheiterte genau
   dieser Checkpoint → starkes Indiz, dass die anderen DBs gesund sind.
2. **Sequenzen:** Nicht anwendbar – stunden/foerderungen/suite nutzen Text-IDs (cuid), keine Sequenzen.
3. **Primärschlüssel-Index vs. sichtbare Zeilen** (Index-Only-Scan, `Heap Fetches` vs. `count(*)`,
   per DO-Block über alle PK-Indizes in `public`):
   - stunden: alle Tabellen identisch (`_prisma_migrations` 8, `User` 2, Rest 0).
   - foerderungen: alle identisch (`_prisma_migrations` 3, `Foerderquelle` 15, `User` 2, Rest 0).
   - suite: identisch (`_prisma_migrations` 5, `suite_user` 3, `tool` 4, `zugriff` 9, `audit_log` 59),
     **außer `provision_outbox` 11 sichtbar / 22 Indexeinträge** → erklärt: alle 11 Zeilen haben
     Status `DONE`; der Provision-Worker (`backend/src/lib/provisionWorker.ts`) setzt jede Zeile
     einmal per UPDATE von PENDING auf DONE, `status` ist indiziert
     (`provision_outbox_status_erstelltAm_idx`) → kein HOT-Update → je Zeile ein zweiter
     PK-Indexeintrag auf die tote Altversion. Tabelle zu klein für Autovacuum. Kein Defekt.
   - handkassen (nach Restore): alle identisch, **außer `buchungsposition` 15 / 17** → erklärt:
     seit dem Restore 2 DELETEs (n_tup_del 2, n_dead_tup 2) durch Bearbeiten/Storno, siehe
     Audit-Log 118 `buchung.geaendert` 11:03:19 UTC, 119 `buchung.geaendert` 11:08:12 UTC,
     120 `buchung.storniert` 11:08:24 UTC. Kein Defekt.

**Ergebnis: Nur die Handkassen-DB war betroffen.** Optional zur letzten Gewissheit (harmlos, aber
schreibt): `VACUUM provision_outbox;` bzw. `VACUUM buchungsposition;` und danach den
Heap-Fetch-Vergleich wiederholen – dann müssen die Zahlen gleich sein.

Nach dem Restore wurde die Handkasse bereits benutzt (Audit 118–120: zwei Bearbeitungen, ein
Storno, 11:03–11:08 UTC). Eine *neue* Buchung (Nr. 16) war bis ~11:20 UTC noch nicht angelegt.

### G.2 Ursache gefunden: alter Standalone-Handkassen-Stack lief parallel auf demselben Volume

**Das Update-Skript `SERVER - Aktualisieren.bat` (Suite-Root) ist NICHT die Ursache.** Es macht
nur `git pull --ff-only`, `docker compose --profile produktion up -d --build`, `docker image prune -f`.

**Die Ursache ist der Unterordner `handkassen\` mit seiner alten Standalone-Konfiguration:**
- `handkassen\docker-compose.yml` hat Compose-Projektname `handkassen` (= Ordnername), Service
  `db` (postgres:16-alpine, **ohne Profil**, Port 127.0.0.1:5432) mit Volume `db_data`
  → Docker-Name **`handkassen_db_data` – exakt dasselbe Volume wie die Suite** (die Suite
  übernimmt es absichtlich per `name: handkassen_db_data`, docker-compose.yml Z. 353 f.).
  Ebenso `belege_data` → `handkassen_belege_data`.
- Folgende Dateien im Ordner `handkassen\` starten diesen alten Stack und damit eine **zweite
  Postgres-Instanz auf dem Produktiv-Datenverzeichnis**:
  `Handkassen starten.bat` → `start.ps1` (`docker compose up -d db`, dann `… up -d backup`),
  `SERVER - Starten.bat`, `SERVER - Aktualisieren.bat` (git pull + `up -d --build`),
  `SERVER - Neu starten.bat`, `Handkassen wiederherstellen.bat` → `restore.ps1`
  (`docker compose up -d db`), `setup-server.ps1`.
  `handkassen\SERVER - Stoppen.bat` macht `docker compose --profile produktion down`.
- Postgres' Lock-Datei `postmaster.pid` schützt **nicht** über Container hinweg: beide
  Postmaster laufen als PID 1, der zweite hält die fremde Lock-Datei für seine eigene/veraltet.
  Zwei Postmaster mit getrenntem WAL-Strom, getrenntem Transaktionszähler und getrennten
  Shared Buffers schreiben dann in dieselben Dateien → genau das beobachtete Schadensbild
  (Datenseiten mit LSN hinter dem WAL-Ende, Zeilen mit „fremden“ Transaktions-IDs unsichtbar).

**Belege aus den Docker-Desktop-Logs** (`%LOCALAPPDATA%\Docker\log\host\com.docker.backend.exe.log*`,
`…\log\vm\init.log*`; Zeiten UTC):
- Seit mindestens 11.10. 09:28 (ältestes vorhandenes Log) läuft ein alter Container
  `/handkassen-app-1` (Projekt `handkassen`, Netz `handkassen_default`, Port 0.0.0.0:3001)
  in einer **Neustart-Schleife** (ca. alle 60 s `exposer.Add(56bdbabb48ef…)`, 570×).
  Ein laufender alter `handkassen-db-1` ist in diesem Zeitraum nicht zu sehen (vermutlich
  gestoppt → deshalb crashte die alte App ständig).
- **13.10. 10:07:08** alter App-Container 56bdbabb… entfernt; **10:07:45, 10:09:08, 10:11:18**
  jeweils neu erstellt (e72edb9c…, 0815de58…, 233b7def…) → in diesem Zeitraum wurde im Ordner
  `handkassen\` dreimal `docker compose … up` ausgeführt (passend: Windows-„Zuletzt verwendet“
  zeigt den Ordner „Handkassen“ geöffnet um 10:09:53 UTC = 12:09:53 MESZ). Dabei wurde auch der
  alte `db`-Container gestartet → **ab ca. 10:07 zwei Postgres auf `handkassen_db_data`.**
  Wer/was diese Aufrufe gemacht hat, ist nicht protokolliert – **bitte Michael fragen.**
- **10:19:23–10:19:25** Compose (Projekt `handkassen`, also `handkassen\SERVER - Stoppen.bat` o. ä.)
  stoppt und löscht `233b7def…` (alte App), `b45a45ea6e98…` (alter Backup-Container, reagierte
  nicht auf SIGINT → nach 1 s gekillt) und `14ae71afcb89…` (alte DB) und löscht Netz
  `handkassen_default` (61f51443c463…).
- **10:19:26** Der Postgres der Suite (Container `c675df726228…`) **stirbt** („shim disconnected“)
  – typisch für Postgres, wenn seine `postmaster.pid` verschwindet/fremd ist (die alte Instanz
  hat sie beim Herunterfahren gelöscht) → sofortiger Notstopp. **10:19:31** Docker startet ihn
  per Restart-Policy neu (Crash-Recovery mit dem eigenen, älteren WAL über ein
  Datenverzeichnis voller Seiten der anderen Instanz).
- **10:19:52–10:19:54** `SERVER - Aktualisieren.bat` (Suite) erstellt alle DB-Container neu; die
  neue Handkassen-DB startet „sauber“ auf dem bereits gemischten Datenverzeichnis → Fehlerbild.
- Die anderen Suite-DBs waren nicht betroffen, weil nur die Handkassen ein Volume mit dem
  alten Standalone-Stack teilt.

**Empfehlungen (auf dem Entwicklungsrechner umsetzen, dann per Update ausrollen):**
1. **Sofort auf dem Server (organisatorisch):** Im Ordner `C:\OEHTB\OEHTB-suite\handkassen\`
   **keine** `.bat`/`.ps1` mehr starten. Nur noch die Skripte im Suite-Root benutzen.
2. **Alten Stack auf dem Server unschädlich machen**, z. B.:
   - die Server-Skripte in `handkassen\` (`SERVER - *.bat`, `Handkassen starten/stoppen/
     wiederherstellen.bat`, `start.ps1`, `stop.ps1`, `restore.ps1`, `setup-server.ps1`) mit
     einem Schutz versehen: abbrechen, wenn `..\docker-compose.yml` (Suite) existiert oder ein
     Container `oehtb-suite-handkassen-db-1` existiert; oder sie im Suite-Repo ganz entfernen
     und durch Hinweis-Dateien ersetzen;
   - und/oder in `handkassen\docker-compose.yml` einen eigenen Projektnamen setzen
     (`name: handkassen-standalone`) bzw. die Volumes für die Entwicklung umbenennen –
     **Achtung:** das ändert auf dem Entwicklungsrechner den Namen des Dev-DB-Volumes
     (Dev-Daten vorher sichern/umziehen).
3. **Schutz im Suite-Update-Skript** (`SERVER - Aktualisieren.bat`, auch `SERVER - Starten.bat`):
   vor `up` prüfen, ob ein Container eines **anderen** Compose-Projekts eines der Suite-Volumes
   eingebunden hat (`docker ps -a --filter volume=handkassen_db_data` und Label
   `com.docker.compose.project` ≠ `oehtb-suite`) → dann mit Fehlermeldung abbrechen.
4. Zusätzlich (Robustheit): vor dem Neuerstellen der DB-Container ein Sofort-Backup aller DBs,
   nach dem Start ein Plausibilitätscheck; `stop_grace_period: 60s` für die DB-Services.
5. Optional: In den DB-Entrypoint einen Selbstschutz einbauen (z. B. beim Start eine
   Marker-Datei mit Container-Hostname im Datenverzeichnis anlegen und periodisch prüfen) –
   nur falls 2./3. nicht ausreichen.

---

## H. Praktische Hinweise für Claude Code auf dem Server

- PowerShell 5.1 hängt beim Pipen in native Programme ein **BOM** an
  (`$x | docker … sh` → „﻿pg_controldata: not found“). Für Shell-Skripte direkt Befehle mit
  Argumenten verwenden; für Node-Skripte funktioniert `$js | docker compose … exec -T -w /app handkassen-app node -`.
- `\"` in `node -e "…"` wird von PowerShell zerlegt → Node-Code per stdin übergeben (s. o.).
- Der Auto-Mode-Klassifizierer von Claude Code blockiert standardmäßig Lesezugriffe auf
  Produktivdaten und das Löschen von Volumes; Michael hat Lesezugriffe im Chat freigegeben,
  Volume-Löschungen führt er selbst aus.

---
---

# Ursprünglicher Diagnoseplan (vom Entwicklungsrechner, unverändert zur Nachvollziehbarkeit)

## 0. Regeln für die Arbeit auf dem Produktivserver

- Es ist das **Live-System**. Vor jeder schreibenden Datenbank-Aktion, jedem
  Volume-Eingriff und jedem Neustart: erst Michael fragen, dann handeln.
- **Nichts löschen, nichts überschreiben** (kein `docker compose down -v`, kein
  `TRUNCATE`, kein `DROP`, kein `pg_resetwal`) ohne ausdrückliche Freigabe
  und ohne frisches Backup.
- Vor jedem Eingriff ein Backup ziehen, siehe Abschnitt 6.
- Alle Befehle laufen in **PowerShell 5.1** im Ordner `C:\OEHTB\OEHTB-suite`.
  Compose-Profil ist immer `--profile produktion`.
- PowerShell zerlegt `\"` in Argumenten. SQL deshalb in **einfache**
  Anführungszeichen setzen und in SQL keine doppelt-quotierten Bezeichner
  verwenden (notfalls `SELECT *`). Shell-Variablen im Container ebenfalls in
  einfachen Anführungszeichen übergeben (`sh -c '... $VAR ...'`).

## 1. Symptom

- Nach dem Update auf Commit `510699f` meldet die Handkassen-Oberfläche beim
  Speichern einer neuen Buchung „Interner Serverfehler.“ Mit und ohne Beleg.
- Die Buchungsliste zeigt keine Buchungen, Kassenstand 0,00. Kostenstellen
  werden im Dropdown angezeigt.
- Update brachte diese Commits neu auf den Server (laut `git log`):
  `510699f` (Bearbeiten statt Storno), `cd14e7c` (Tailscale), `4ce2612`
  (Härtung), `4ee6581` (DB-Passwort-Sync beim DB-Start), `b1719e6`,
  `2a07144`, `d3383d9`, `78e831e` (Steuersätze dezimal, Start-Belegnummer).
  Das heißt: nicht nur die Bearbeiten-Änderung ist neu, sondern auch zwei
  Migrationen und der neue DB-Entrypoint. Die DB-Container wurden beim Update
  neu erstellt (Entrypoint geändert), die Volumes blieben.

## 2. Was im Log steht (Container `handkassen-app`)

```
Unbehandelter Fehler: PrismaClientKnownRequestError:
Invalid `prisma.buchung.create()` invocation:
Unique constraint failed on the fields: (`buchungsnummer`)
    at async file:///app/dist/routes/buchungen.js:246:25
    at async file:///app/dist/routes/buchungen.js:223:22
  code: 'P2002', meta: { modelName: 'Buchung', target: [ 'buchungsnummer' ] }
```

Zeile 223 = `prisma.$transaction` in `POST /api/buchungen`, Zeile 246 =
`tx.buchung.create`. Direkt davor steht:

```ts
const maxNummer = await tx.buchung.aggregate({ _max: { buchungsnummer: true } });
const naechsteNummer = (maxNummer._max.buchungsnummer ?? 0) + 1;
```

Beim Container-Start außerdem:

```
20 migrations found in prisma/migrations
No pending migrations to apply.
> tsx prisma/seed.ts
    at async main (/app/prisma/seed.ts:75:7)      <- PrismaClientKnownRequestError
Seed uebersprungen
```

## 3. Was in der Datenbank stand (vor der Reparatur)

```
SELECT count(*), max(buchungsnummer), max(id) FROM buchung;   -> 1 | 1 | 1
SELECT relrowsecurity FROM pg_class WHERE relname='buchung';   -> f
_prisma_migrations: alle 20 vorhanden
\l  -> nur handkassen, postgres, template0, template1
```

## 4. Auf dem Entwicklungsrechner ausgeschlossen

- Code-Pfad „Buchung anlegen“ durch `510699f` logisch unverändert; 78 Backend-Tests grün.
- Produktions-Image baut lokal sauber.
- Migrationskette = Prisma-Schema (`prisma migrate diff`: „No difference detected“).
- Keine Prisma-Middleware, kein RLS, kein umgebogener Unique-Index. Seed legt keine Buchungen an.

## 5. Hypothesen (Ergebnis in Klammern)

- H1 App spricht mit anderer DB → **widerlegt** (C.1)
- H2 Sichtbarkeitsproblem im Datenverzeichnis → **bestätigt** in der Form „WAL/pg_control
  älter als Datenseiten“ (C.6, C.7); nicht über `xmin > txid_current` der sichtbaren Zeile
  nachweisbar, sondern über Index-Heap-Fetches und den xlog-flush-Fehler
- H3 zwei Postgres am selben Volume → **widerlegt** (C.2)

## 6.–10. (Backup-Befehle, Diagnoseschritte, H2-Vorgehen, Rollback, Dateien)

Durch die Abschnitte C–D ersetzt. Rollback auf `cd14e7c` war nicht nötig und hätte nicht
geholfen. Relevante Dateien: `handkassen/backend/src/routes/buchungen.ts` (POST ab Z. 238),
`handkassen/backend/src/lib/db.ts`, `handkassen/backend/prisma/seed.ts`,
`handkassen/backend/prisma/migrations/`, `docker-compose.yml` (Anker
`x-db-pw-sync-entrypoint` Z. 31–47, Volumes Z. 353 ff.), `SERVER - Aktualisieren.bat`,
`handkassen/backup/` (backup.sh, restore.sh, restore-test.sh).

---

## I. Umgesetzt auf dem Entwicklungsrechner (13.10.2026, nach Rückkehr des Handovers)

Aus G.2/G.3/G.4, ausgerollt per `SERVER - Aktualisieren.bat`:

1. **Alter Standalone-Stack unschädlich gemacht:** `handkassen/suite-schutz.ps1` bricht ab,
   sobald ein Container `oehtb-suite-handkassen-db-*` existiert oder ein Container eines anderen
   Compose-Projekts an `handkassen_db_data`/`handkassen_belege_data` hängt. Eingebaut in
   `handkassen/SERVER - Aktualisieren|Neu starten|Starten|Stoppen.bat`, `start.ps1`,
   `restore.ps1`, `setup-server.ps1`. Auf dem Entwicklungsrechner (ohne Suite-Container)
   laufen die Skripte unverändert.
2. **Schutz in den Suite-Skripten:** `scripts/volume-schutz.ps1` prüft vor `docker compose up`
   in `SERVER - Starten.bat` und `SERVER - Aktualisieren.bat`, ob ein fremder Container
   (Projekt ≠ `oehtb-suite`) eines der fünf Suite-Volumes eingebunden hat → Abbruch mit
   Anleitung. Hinweis: Auch der Altlast-Container `sharp_varahamihira` löst aus, falls er
   `handkassen_belege_data` mountet → dann `docker rm sharp_varahamihira` (löscht keine Daten).
3. **Sofort-Sicherung + Plausibilitätscheck** (`scripts/db-sicherung-update.ps1`): vor dem
   Neubau `pg_dump` aller vier DBs nach `backups-vor-update\<Zeitstempel>\` (gitignored,
   letzte 10 bleiben) plus exakte Zeilenzahlen; nach dem Start Vergleich, Warnung bei
   fehlenden Zeilen/Tabellen. Schlägt die Sicherung fehl, wird nicht gebaut.
4. **`stop_grace_period: 60s`** für `suite-db`, `handkassen-db`, `stunden-db`, `foerderungen-db`.
5. **`handkassen_belege_data: external: true`**; `SERVER - Starten.bat` und
   `SERVER - Aktualisieren.bat` legen das Volume vorher idempotent per `docker volume create` an.
6. Doku: Warnblock in `handkassen/README.md`, Abschnitt zum Update-Schutz in `INSTALL.md`.

**Wichtig beim ersten Ausrollen:** `SERVER - Aktualisieren.bat` holt sich per `git pull`
selbst neu; der Dateianfang bis zum Einfügepunkt ist byte-identisch geblieben, damit `cmd`
nach dem Pull sauber in der neuen Version weiterliest.

## J. Nachtrag: Standalone-Betrieb vollständig entfernt (13.10.2026, später am Tag)

Auf Michaels Wunsch wurde der alte Standalone-Stack komplett aus dem Repo entfernt statt nur
abgesichert: alle `SERVER - *.bat`, `Handkassen *.bat`, `start/stop/restore/setup-server.ps1`,
`handkassen/.env.example`, `INSTALL-Windows-Server.md`, `UPDATE-admin.md`, `.githooks`,
`.gitattributes`, `.gitignore` im Tool-Ordner sowie das zwischenzeitlich angelegte
`suite-schutz.ps1`. `handkassen/docker-compose.yml` enthält nur noch die Entwicklungs-DB
(`handkassen-dev-db`, Bind-Mount `postgres-data/`, kein benanntes Volume). `scripts/volume-schutz.ps1`
und `scripts/db-sicherung-update.ps1` bleiben als Schutz in den Suite-Skripten. Die manuellen
Server-Aufräumschritte (Abschnitt G, Punkte 5/6: Altlast-Container, anonyme Volumes, `handkassen\.env`)
und die spätere Entfernung der Spalten `passwortHash`/`passwortSetzen` sind noch offen.

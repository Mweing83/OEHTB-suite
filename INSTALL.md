# OEHTB-Suite – Installation & Cutover

Diese Anleitung beschreibt die Erstinstallation auf dem ÖHTB-Server und den
Umstieg von der bestehenden **einzelnen** Handkassen-Installation auf die Suite.

> **Wichtigster Punkt (Datenübernahme):** Die Suite verwendet die BESTEHENDEN
> Docker-Volumes der Handkassen-Installation weiter (`handkassen_db_data`,
> `handkassen_belege_data`). Dadurch sind alle Buchungen/Belege sofort da. Diese
> Volumes sind in `docker-compose.yml` mit explizitem `name:` referenziert.
> Voraussetzung: Sie wurden ursprünglich vom Compose-Projekt „handkassen“
> angelegt (Standardname). Im Zweifel vorher `docker volume ls` prüfen.

## 1. Vorbereitung

1. Den kompletten Ordner `OEHTB-Suite` auf den Server kopieren/klonen. Die Tools
   sind als Unterordner `handkassen/`, `stunden/` und `foerderungen/` bereits
   enthalten – die Build-Kontexte zeigen nach innen. Es ist kein weiterer Ordner
   nötig.
2. **`.env` erzeugen (empfohlen, automatisch):** Doppelklick auf
   **`SERVER - Einrichten.bat`** (oder
   `powershell -ExecutionPolicy Bypass -File .\einrichten.ps1`). Das Skript legt
   eine `.env` mit **starken, zufälligen** Secrets an (JWT, Provisionierung, alle
   DB-Passwörter, beide ENCRYPTION_KEYs). Eine bereits vorhandene `.env` wird nie
   überschrieben.
   - Zugriff läuft über **Tailscale-HTTPS** (siehe Abschnitt 5): `COOKIE_INSECURE`
     bleibt leer. Nur für reinen HTTP-LAN-Betrieb im Skript-Ergebnis auf `1` setzen.
   - **Handkassen-DB-Zugang (nur beim Cutover):** Übernimmst du das bestehende
     Handkassen-Volume, müssen `HK_DB_USER`/`HK_DB_PASSWORD`/`HK_DB_NAME` in der
     erzeugten `.env` auf die **ursprünglichen** Werte des Volumes geändert werden –
     sonst kann die App die vorhandene Datenbank nicht öffnen.
   - Die erzeugte `.env` sicher aufbewahren (Passwort-Manager): Ohne die
     ENCRYPTION_KEYs sind gespeicherte API-Keys nicht mehr entschlüsselbar.

> **Fail-fast:** Die Backends verweigern in Produktion den Start, wenn ein Secret
> noch ein Platzhalter, zu kurz oder ein bekanntes Standard-DB-Passwort ist. Eine
> per Skript erzeugte `.env` erfüllt alle Anforderungen automatisch.

## 2. Alte Handkassen-Installation stoppen

Im **bisherigen** Handkassen-Ordner auf dem Server (die zuvor eigenständig
betriebene Installation):

```
docker compose down          # Container stoppen, Volumes BLEIBEN erhalten
```

## 3. Suite starten

```
cd ../OEHTB-Suite
docker compose --profile produktion up -d --build
```

Beim ersten Start passiert automatisch (in den jeweiligen Container-Startbefehlen):
- Alle Backends wenden ihre Migrationen selbst an (`prisma migrate deploy`).
- Das Portal seedet die **Tool-Registry** und den Benutzer **`admin`**
  (idempotent, upsert) und startet dann.

Kein manueller Seed-Schritt nötig.

**Erstes Login (Admin):** Der Benutzer `admin` wird **ohne Passwort** angelegt.
Beim ersten Login im Portal (Benutzername `admin`) fordert die Oberfläche direkt
zur Vergabe eines Passworts auf – es gibt bewusst **kein** Standard-Passwort.
Danach als `admin` unter **Verwaltung** die weiteren Benutzer und Rechte pflegen.

## 4. Bestandsnutzer importieren

Übernimmt die vorhandenen Benutzer beider Tools ins Portal **inklusive ihrer
Passwort-Hashes** (bestehende Passwörter gelten weiter), vergibt den Zugriff mit
der heutigen Rolle und verknüpft die Tool-Konten (`suiteUserId`).

```
cd backend
# Trockenlauf (zeigt nur, was passieren würde):
HK_DATABASE_URL=... STUNDEN_DATABASE_URL=... npm run import
# Wirklich übernehmen:
HK_DATABASE_URL=... STUNDEN_DATABASE_URL=... npm run import -- --apply
```

- „Gleiche Person in beiden Tools“ wird über den Benutzernamen erkannt
  (Stunden-Benutzername = Teil vor dem `@` der E-Mail). Abweichungen lassen sich
  über `backend/import-mapping.json` (`{ "email@…": "benutzername" }`) steuern.
- Danach im Portal als `admin` anmelden und unter **Verwaltung** die
  Zugriffsmatrix prüfen/feinjustieren.

## 5. HTTPS / Fernzugriff (Tailscale)

```
tailscale serve --bg https / http://localhost:80
```

Ersetzt die frühere Zuordnung auf Port 3001. Danach ist die Suite unter der
Tailscale-URL erreichbar; die Tools liegen unter `/handkassen` und `/stunden`.

## 6. Prüfen

- Portal-Login funktioniert, Kacheln erscheinen gemäß Rechten.
- `/handkassen` öffnet sich ohne zweite Anmeldung; Buchungen sind vorhanden.
- `/stunden` öffnet sich ohne zweite Anmeldung.
- Nächtliches Backup läuft (Dienst `handkassen-backup`).

## Rollback

Die Suite ändert an den Tool-Datenbanken nur **additiv** (Spalte `suiteUserId`).
Zurück zur Einzel-Installation:

```
cd OEHTB-Suite && docker compose --profile produktion down
cd handkassen && docker compose up -d         # Tool eigenständig, Daten unverändert
```

Die alten lokalen Logins der Handkassen sind weiterhin vorhanden (Passwort-Hashes
wurden nicht gelöscht). Für Stunden ggf. Admin-Passwort neu setzen.

## Sicherheits-Checkliste (vor Produktivbetrieb)

- [ ] `.env` per `SERVER - Einrichten.bat` erzeugt (starke Zufalls-Secrets) und
      sicher gesichert (Passwort-Manager).
- [ ] `admin`-Passwort beim ersten Login gesetzt (es gibt kein Standard-Passwort).
- [ ] Beide `*_ENCRYPTION_KEY` gesetzt (sonst sind gespeicherte API-Keys nicht
      entschlüsselbar) – vom Skript automatisch erledigt.
- [ ] Zugriff über HTTPS (Tailscale/Proxy); `COOKIE_INSECURE` leer. Nur im
      abgeschotteten LAN bewusst `COOKIE_INSECURE=1`.
- [ ] Backup-Zielpfade (NAS/USB) in `.env` auf die echten Mounts gesetzt.
- [ ] Nur Port 80 nach außen (übernimmt Tailscale/Proxy); die Datenbank-Ports
      sind ausschließlich am Server selbst (127.0.0.1) bzw. gar nicht
      veröffentlicht.

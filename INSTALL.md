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
   sind als Unterordner `handkassen/` und `stunden/` bereits enthalten – die
   Build-Kontexte zeigen nach innen (`./handkassen`, `./stunden`). Es ist kein
   weiterer Ordner nötig.
2. `.env` anlegen: `cp .env.example .env` und Werte setzen – vor allem
   **`JWT_SECRET`** (langer Zufallswert) und die DB-Passwörter. Für reinen
   HTTP-Betrieb im LAN `COOKIE_INSECURE=1` lassen; hinter HTTPS entfernen.
   - **Handkassen-DB-Zugang:** `HK_DB_USER`/`HK_DB_PASSWORD`/`HK_DB_NAME` müssen
     zu den Werten passen, mit denen das bestehende Volume angelegt wurde.

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
- Alle drei Backends wenden ihre Migrationen selbst an (`prisma migrate deploy`).
- Das Portal seedet die **Tool-Registry** und den Benutzer **`admin`**
  (idempotent, upsert) und startet dann.

Kein manueller Seed-Schritt nötig. `admin`-Passwort danach im Portal ändern.

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

- [ ] `JWT_SECRET` langer Zufallswert, in `.env` (nicht der Platzhalter).
- [ ] DB-Passwörter gesetzt, `admin`-Passwort im Portal geändert.
- [ ] `STUNDEN_ENCRYPTION_KEY` gesetzt (sonst sind gespeicherte API-Keys nicht
      entschlüsselbar).
- [ ] HTTPS davor (Tailscale/Proxy) ODER bewusst `COOKIE_INSECURE=1` im
      abgeschotteten LAN.
- [ ] Backup-Zielpfade (NAS/USB) in `.env` auf die echten Mounts gesetzt.

# OEHTB-Suite – Ein-Klick-Installer für den Client-Server

Datum: 2026-07-15
Status: Genehmigt (Design)

## Ziel

Die Suite auf dem Windows-Server des Kunden (ÖHTB) mit einem doppelklickbaren
Skript installierbar machen. Der Kunde soll **keine** Konfigurationsdatei von
Hand bearbeiten müssen: Das Skript prüft die Voraussetzungen, erzeugt die
Geheimnisse, schreibt `.env`, baut und startet die Container, wartet auf die
Bereitschaft und bietet – bei einem Umstieg von einer bestehenden
Handkassen-Installation – den Bestandsnutzer-Import an.

Nicht-Ziele: Installation von Docker Desktop selbst; HTTPS-/Tailscale-Setup
(bleibt dokumentierter manueller Schritt); Linux-Unterstützung.

## Zielumgebung

- Windows Server mit installiertem und laufendem Docker Desktop / Docker Engine.
- Kein Node.js auf dem Host erforderlich – alles läuft in Containern.
- Passt zu den bestehenden Helfern `SERVER - Starten/Stoppen/Status.bat`.

## Zwei entscheidende technische Randbedingungen

1. **`scripts/import.ts` liegt nicht im Laufzeit-Image.** `backend/Dockerfile`
   kopiert nur `prisma/seed.ts` und `dist/` in die Runtime-Stufe. Damit der
   Bestandsnutzer-Import ohne Host-Node laufen kann, muss das Skript ins Image
   gelangen (`docker compose exec portal-app npx tsx scripts/import.ts`).
   → Eine zusätzliche `COPY`-Zeile im Dockerfile.

2. **Handkassen-DB-Zugangsdaten dürfen beim Cutover NICHT neu erzeugt werden.**
   Postgres wendet `POSTGRES_PASSWORD` nur bei der *Erstinitialisierung* eines
   leeren Datenverzeichnisses an. Die Suite verwendet das bestehende Volume
   `handkassen_db_data` weiter; ein neu generiertes `HK_DB_PASSWORD` würde zu
   Authentifizierungsfehlern führen. Beim Cutover müssen die HK-Zugangsdaten den
   alten Werten entsprechen. Nur *neu* angelegte Datenbanken (Suite immer;
   Handkassen/Stunden nur wenn kein Bestands-Volume existiert) dürfen
   randomisiert werden.

## Lieferumfang

- **Neu:** `SERVER - Installieren.bat` – dünner Doppelklick-Starter, ruft
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install.ps1` auf.
- **Neu:** `scripts/install.ps1` – enthält die gesamte Logik.
- **Geändert:** `backend/Dockerfile` – eine `COPY backend/scripts/import.ts`
  (und, falls vorhanden, `import-mapping.json`) in die Runtime-Stufe.
- **Geändert:** `INSTALL.md` – neuer Abschnitt „Schnellinstallation (Skript)“
  vor den bestehenden manuellen Schritten; die manuellen Schritte bleiben als
  Fallback erhalten.

Alle Kunden-sichtbaren Texte sind deutsch (Repo-Konvention).

## Ablauf von `install.ps1`

Das Skript ist **idempotent** und wechselt zuerst ins Repo-Wurzelverzeichnis
(`Split-Path` des Skriptpfads → Elternordner). Bei jedem Fehler klare deutsche
Meldung und definierter Abbruch (Exit-Code ≠ 0), am Ende `pause`-artiges
Warten, damit das Fenster beim Doppelklick nicht sofort schließt.

### 1. Voraussetzungen prüfen
- `docker version` / `docker compose version` vorhanden?
- `docker info` erfolgreich (Daemon läuft)?
- Andernfalls: Meldung „Docker Desktop nicht gefunden bzw. nicht gestartet“ und
  Abbruch.

### 2. Cutover-Erkennung
- `docker volume ls` auf `handkassen_db_data` und `handkassen_belege_data`.
- Existiert eines der Volumes → **Cutover-Modus**, sonst **Fresh-Modus**.
- Zusätzlich prüfen, ob ein **laufender** Container diese Volumes belegt
  (`docker ps` + `docker inspect` der Mounts). Falls ja: Abbruch mit dem Hinweis,
  die alte Installation zuerst zu stoppen (`docker compose down` im alten
  Ordner) – zwei Postgres-Instanzen dürfen nicht dasselbe Datenverzeichnis
  öffnen.

### 3. `.env` erzeugen (überschreibt eine vorhandene `.env` NIE)
- Existiert `.env` bereits → unverändert lassen, Hinweis „vorhandene .env
  beibehalten“, weiter zu Schritt 4.
- Sonst: `.env.example` als Vorlage lesen und Platzhalter ersetzen.

Generatoren:
- `JWT_SECRET` – 48 zufällige Bytes, Base64.
- `PROVISION_SECRET` – 32 zufällige Bytes, Base64.
- `STUNDEN_ENCRYPTION_KEY` – **genau 32** Zeichen (alphanumerisch).
- `SUITE_DB_PASSWORD` – starkes Zufallspasswort.
- `HK_DB_PASSWORD`, `STUNDEN_DB_PASSWORD` – siehe Modus:
  - **Fresh-Modus:** ebenfalls randomisieren.
  - **Cutover-Modus:** `HK_DB_USER/PASSWORD/NAME` **abfragen**
    (Vorgabewerte `handkassen/handkassen/handkassen`), damit sie zu dem
    bestehenden Volume passen. `STUNDEN_*` nur abfragen, wenn auch
    `stunden_db_data` als Bestands-Volume existiert; sonst randomisieren.

Zufallserzeugung mit `System.Security.Cryptography.RandomNumberGenerator`
(kryptografisch sicher), nicht `Get-Random`.

Eine operative Rückfrage: **„Läuft die Suite hinter HTTPS (Tailscale/Proxy)?“**
- Ja → `COOKIE_INSECURE` leer lassen (Cookies nur über HTTPS).
- Nein → `COOKIE_INSECURE=1` setzen (reiner HTTP-LAN-Betrieb).

`.env` wird UTF-8 **ohne BOM** geschrieben (Docker Compose liest die Datei;
ein BOM würde die erste Variable verfälschen).

### 4. Bauen & Starten
`docker compose --profile produktion up -d --build`. Bei Fehler: Hinweis auf
`docker compose --profile produktion logs` und Abbruch.

### 5. Auf Bereitschaft warten
`http://localhost/` bis zu ~3 Minuten pollen (gleiche Schleife wie in
`SERVER - Starten.bat`). Timeout → Warnung mit Log-Hinweis, aber kein harter
Abbruch (Dienste laufen ggf. noch an).

### 6. Bestandsnutzer-Import (nur Cutover-Modus)
- Voraussetzung: Dockerfile-Änderung, sodass `scripts/import.ts` im Image liegt.
- **Trockenlauf im Container:**
  `docker compose exec -e HK_DATABASE_URL=... -e STUNDEN_DATABASE_URL=...
   portal-app npx tsx scripts/import.ts` – die URLs zeigen auf `handkassen-db`
  bzw. `stunden-db` mit den `.env`-Zugangsdaten. `DATABASE_URL` (Suite) ist im
  Container bereits gesetzt.
- Vorschau anzeigen, dann fragen: **„Übernehmen? (j/N)“**
  - Ja → erneut mit `--apply` ausführen.
  - Nein → überspringen, Hinweis, dass der Import später manuell möglich ist.

### 7. Abschlussbericht
- Erreichbar unter `http://<COMPUTERNAME>` (Tools: `/handkassen`, `/stunden`).
- Hinweis: `.env` enthält jetzt die erzeugten Geheimnisse → **sichern**.
- `admin` / `admin123` → **sofort im Portal ändern**.
- HTTPS-Hinweis: `tailscale serve --bg https / http://localhost:80`.

## Architektur / Isolation

- `SERVER - Installieren.bat`: nur Starter (Aufgabe: PowerShell mit Bypass
  starten). Keine Logik.
- `scripts/install.ps1`: eine Datei, klar in Funktionen gegliedert
  (`Test-Voraussetzungen`, `Get-CutoverModus`, `New-EnvDatei`,
  `Start-Suite`, `Wait-Bereit`, `Invoke-Import`, `Write-Abschluss`).
  Jede Funktion hat einen Zweck, kommuniziert über Rückgabewerte/Parameter und
  ist einzeln nachvollziehbar.
- `backend/Dockerfile`: additive Änderung, keine Auswirkung auf bestehendes
  Verhalten außer dass `scripts/import.ts` verfügbar wird.

## Fehlerbehandlung

- Fehlendes/gestopptes Docker → früher, klarer Abbruch.
- Laufende Alt-Installation auf den Volumes → Abbruch mit Handlungsanweisung.
- Vorhandene `.env` → nie überschreiben (Schutz vor Verlust bestehender
  Geheimnisse bei erneutem Lauf).
- Build-/Start-Fehler → Log-Hinweis, Abbruch.
- Health-Timeout → Warnung, kein Datenverlust, Log-Hinweis.
- Import-Fehler → gemeldet, Suite bleibt lauffähig (Import ist optional/additiv).

## Test / Verifikation

Da es sich um ein Betriebs-/Installationsskript handelt, erfolgt die
Verifikation durch Ausführen gegen echte Docker-Zustände, nicht durch
Unit-Tests:
1. **Fresh-Install:** Ohne Bestands-Volumes, ohne `.env` → `.env` mit
   Zufallswerten entsteht, Suite wird erreichbar, Import-Schritt entfällt.
2. **Idempotenz:** Zweiter Lauf → vorhandene `.env` bleibt unverändert, Suite
   startet erneut ohne Fehler.
3. **Cutover-Simulation:** Mit vorhandenem `handkassen_db_data`-Volume →
   HK-Zugangsdaten werden abgefragt, Import-Trockenlauf zeigt Personen,
   `--apply` überträgt sie (im Portal sichtbar).
4. **Guard:** Läuft die alte Installation noch → Abbruch mit korrektem Hinweis.
5. **Dockerfile:** `docker compose build portal-app` erfolgreich; im Container
   ist `scripts/import.ts` vorhanden (`docker compose exec portal-app ls
   scripts`).

## Offene Punkte

Keine. Die beiden Entscheidungen (HK-Zugangsdaten beim Cutover abfragen statt
raten; genau eine HTTPS/HTTP-Rückfrage) sind Teil des genehmigten Designs.

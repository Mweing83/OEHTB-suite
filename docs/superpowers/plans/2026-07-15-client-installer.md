# Client-Installer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a double-click Windows installer that provisions the OEHTB-Suite on the client server end-to-end (prereq check, secret generation, `.env`, build/start, health wait, optional Bestandsnutzer-import) without any manual config editing.

**Architecture:** A thin `.bat` launcher starts `scripts/install.ps1` with an execution-policy bypass; the PowerShell script holds all logic in small named functions. A one-line `backend/Dockerfile` change bakes `scripts/import.ts` into the runtime image so the import runs inside the container (no host Node). `INSTALL.md` gains a "Schnellinstallation" section that points at the script and keeps the manual steps as fallback.

**Tech Stack:** Windows PowerShell 5.1, Docker Compose v2, existing Node/Prisma/tsx image.

## Global Constraints

- Target shell: **Windows PowerShell 5.1** — use only APIs available there (`[System.Security.Cryptography.RandomNumberGenerator]::Create()`, not `::Fill`; `Invoke-WebRequest -UseBasicParsing`).
- All user-facing text is **German** (repo convention).
- `.env` is written **UTF-8 without BOM** (a BOM corrupts the first Compose variable).
- An **existing `.env` is never overwritten**.
- **DB passwords are alphanumeric only** (they go into `postgresql://…` URLs — no percent-encoding needed).
- **`STUNDEN_ENCRYPTION_KEY` is exactly 32 characters.**
- On **cutover** (existing `handkassen_db_data` / `stunden_db_data` volume) the matching DB credentials are **prompted, not randomized** — Postgres only applies `POSTGRES_PASSWORD` on first init of an empty data dir.
- Docker Compose production commands use `--profile produktion` (matches the existing `.bat` helpers).

---

### Task 1: Bake `import.ts` into the runtime image

The Bestandsnutzer-import must run inside `portal-app` (client server has Docker but no host Node). The runtime stage currently copies only `dist/` and `prisma/seed.ts`, so `scripts/import.ts` is absent. Add one `COPY`.

**Files:**
- Modify: `backend/Dockerfile` (runtime stage, after the `seed.ts` copy at line 39)

**Interfaces:**
- Produces: file `/app/scripts/import.ts` inside the `portal-app` image, runnable via `docker compose exec portal-app npx tsx scripts/import.ts`. `tsx`, `pg`, `@prisma/client`, and `dotenv` are already runtime dependencies; the generated Prisma client is already present.

- [ ] **Step 1: Add the COPY line**

In `backend/Dockerfile`, immediately after this existing line (line 39):

```dockerfile
COPY backend/prisma/seed.ts ./prisma/seed.ts
```

insert:

```dockerfile
# Import-Skript verfuegbar halten, damit der Bestandsnutzer-Import direkt im
# Container laufen kann (docker compose exec portal-app npx tsx scripts/import.ts).
COPY backend/scripts/import.ts ./scripts/import.ts
```

- [ ] **Step 2: Build the image**

Run: `docker compose --profile produktion build portal-app`
Expected: build completes without error (exit code 0).

- [ ] **Step 3: Verify the file is present in the image**

Run: `docker compose --profile produktion run --rm --no-deps --entrypoint sh portal-app -c "ls scripts"`
Expected: output lists `import.ts`.

- [ ] **Step 4: Commit**

```bash
git add backend/Dockerfile
git commit -m "Dockerfile: import.ts ins Laufzeit-Image aufnehmen"
```

---

### Task 2: Installer script + launcher

The heart of the feature: `scripts/install.ps1` plus the `SERVER - Installieren.bat` launcher that sits beside the existing `SERVER - Starten/Stoppen/Status.bat`.

**Files:**
- Create: `scripts/install.ps1`
- Create: `SERVER - Installieren.bat`

**Interfaces:**
- Consumes: `.env.example` (template), `docker-compose.yml` (profile `produktion`), `scripts/import.ts` inside the image (from Task 1).
- Produces: a populated `.env`, running Compose stack, and (on cutover) an executed import. Internal PowerShell functions: `New-Base64Secret([int])`, `New-AlnumSecret([int])`, `Set-EnvValue([string[]] $lines,[string] $key,[string] $value) -> [string[]]`, plus `Schritt/Info/Warnung/Fehler/Beenden` output helpers.

- [ ] **Step 1: Create `SERVER - Installieren.bat`**

Create `SERVER - Installieren.bat` with exactly:

```bat
@echo off
REM OEHTB-Suite installieren bzw. aktualisieren.
REM Duennerer Starter: ruft das PowerShell-Installationsskript auf.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1"
```

- [ ] **Step 2: Create `scripts/install.ps1`**

Create `scripts/install.ps1` with exactly:

```powershell
#Requires -Version 5.1
<#
  OEHTB-Suite - Installations- und Cutover-Skript fuer den Windows-Server.
  Start ueber "SERVER - Installieren.bat" (ExecutionPolicy Bypass).

  Ablauf:
    1 Voraussetzungen pruefen (Docker + Compose)
    2 Bestehende Installation / Cutover erkennen
    3 .env erzeugen (vorhandene .env bleibt unangetastet)
    4 Container bauen & starten
    5 Auf Bereitschaft warten
    6 Optionaler Bestandsnutzer-Import (nur Cutover)
    Abschlussbericht
#>

$ErrorActionPreference = 'Stop'

# --- ins Repo-Wurzelverzeichnis wechseln (dieses Skript liegt in scripts\) ---
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

# --- Ausgabe-Helfer ---------------------------------------------------------
function Schritt($text) { Write-Host "`n=== $text ===" -ForegroundColor Cyan }
function Info($text)    { Write-Host "    $text" }
function Warnung($text) { Write-Host "    WARNUNG: $text" -ForegroundColor Yellow }
function Fehler($text)  { Write-Host "`nFEHLER: $text" -ForegroundColor Red }
function Beenden($code) { Write-Host ""; Read-Host "Zum Schliessen [Enter] druecken" | Out-Null; exit $code }

# --- kryptografisch sichere Zufallswerte ------------------------------------
function New-Base64Secret([int]$bytes) {
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $buf = New-Object 'byte[]' $bytes; $rng.GetBytes($buf); return [Convert]::ToBase64String($buf) }
  finally { $rng.Dispose() }
}

function New-AlnumSecret([int]$len) {
  # 62er-Alphabet; minimale Modulo-Verzerrung ist fuer Passwoerter dieser Laenge unerheblich.
  $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $buf = New-Object 'byte[]' $len; $rng.GetBytes($buf)
    $sb = New-Object System.Text.StringBuilder
    foreach ($b in $buf) { [void]$sb.Append($alphabet[$b % $alphabet.Length]) }
    return $sb.ToString()
  } finally { $rng.Dispose() }
}

# --- eine .env-Zeile setzen (ersetzt "KEY=..." oder "# KEY=...") -------------
function Set-EnvValue([string[]]$lines, [string]$key, [string]$value) {
  $found = $false
  $out = foreach ($l in $lines) {
    if ($l -match ("^#?\s*" + [regex]::Escape($key) + "=")) { $found = $true; "$key=$value" }
    else { $l }
  }
  if (-not $found) { $out = @($out) + "$key=$value" }
  ,@($out)
}

# ===========================================================================
Schritt "OEHTB-Suite - Installation"

# --- 1. Voraussetzungen -----------------------------------------------------
Schritt "1/6  Voraussetzungen pruefen"
try { & docker --version *> $null } catch { Fehler "Docker ist nicht installiert oder nicht im PATH."; Beenden 1 }
& docker info *> $null
if ($LASTEXITCODE -ne 0) { Fehler "Docker laeuft nicht. Bitte Docker Desktop starten und erneut ausfuehren."; Beenden 1 }
& docker compose version *> $null
if ($LASTEXITCODE -ne 0) { Fehler "'docker compose' (Compose v2) ist nicht verfuegbar."; Beenden 1 }
Info "Docker und Docker Compose gefunden."

# --- 2. Cutover-Erkennung ---------------------------------------------------
Schritt "2/6  Bestehende Installation pruefen"
$volumes    = @(& docker volume ls --format '{{.Name}}')
$hatHkDb    = $volumes -contains 'handkassen_db_data'
$hatHkFiles = $volumes -contains 'handkassen_belege_data'
$hatStunden = $volumes -contains 'stunden_db_data'
$cutover    = $hatHkDb -or $hatHkFiles

if ($cutover) {
  Info "Bestehende Handkassen-Daten gefunden (Cutover-Modus)."
  # Konflikt: benutzt ein FREMDER (nicht zu dieser Suite gehoerender) laufender
  # Container die Daten-Volumes? Dann laeuft die alte Installation noch.
  $eigene = @()
  try { $eigene = @(& docker compose --profile produktion ps -a -q) } catch {}
  $konflikt = @()
  foreach ($v in @('handkassen_db_data','handkassen_belege_data','stunden_db_data')) {
    foreach ($id in @(& docker ps --filter "volume=$v" -q)) {
      if ($id -and ($eigene -notcontains $id)) { $konflikt += $id }
    }
  }
  $konflikt = $konflikt | Select-Object -Unique
  if ($konflikt) {
    $namen = ($konflikt | ForEach-Object { (& docker inspect --format '{{.Name}}' $_).TrimStart('/') }) -join ', '
    Fehler ("Es laeuft noch eine andere Installation auf den vorhandenen Daten-Volumes:`n" +
            "      $namen`n" +
            "      Bitte zuerst die alte Installation stoppen (im alten Ordner: 'docker compose down')`n" +
            "      und dieses Skript danach erneut ausfuehren.")
    Beenden 1
  }
} else {
  Info "Keine Bestandsdaten gefunden (Neuinstallation)."
}

# --- 3. .env erzeugen -------------------------------------------------------
Schritt "3/6  Konfiguration (.env)"
$envPath = Join-Path $Root '.env'
if (Test-Path $envPath) {
  Info "Vorhandene .env gefunden - wird unveraendert beibehalten."
} else {
  $examplePath = Join-Path $Root '.env.example'
  if (-not (Test-Path $examplePath)) { Fehler ".env.example fehlt - Installation nicht moeglich."; Beenden 1 }
  $lines = @(Get-Content $examplePath)

  Write-Host ""
  $https = Read-Host "Laeuft die Suite hinter HTTPS (Tailscale/Reverse-Proxy)? [j/N]"
  $istHttps = ($https -match '^(j|ja|y|yes)$')

  # Geheimnisse (immer neu erzeugen)
  $lines = Set-EnvValue $lines 'JWT_SECRET'             (New-Base64Secret 48)
  $lines = Set-EnvValue $lines 'PROVISION_SECRET'       (New-Base64Secret 32)
  $lines = Set-EnvValue $lines 'STUNDEN_ENCRYPTION_KEY' (New-AlnumSecret 32)
  $lines = Set-EnvValue $lines 'SUITE_DB_PASSWORD'      (New-AlnumSecret 24)

  # Cookies nur im reinen HTTP-LAN-Betrieb unsicher setzen
  if (-not $istHttps) { $lines = Set-EnvValue $lines 'COOKIE_INSECURE' '1' }

  # Handkassen-DB: beim Cutover die BESTEHENDEN Zugangsdaten uebernehmen
  if ($hatHkDb) {
    Write-Host ""
    Info "Die bestehende Handkassen-Datenbank braucht ihre urspruenglichen Zugangsdaten:"
    $hkUser = Read-Host "  HK_DB_USER  [handkassen]";     if (-not $hkUser) { $hkUser = 'handkassen' }
    $hkPass = Read-Host "  HK_DB_PASSWORD [handkassen]";  if (-not $hkPass) { $hkPass = 'handkassen' }
    $hkName = Read-Host "  HK_DB_NAME  [handkassen]";     if (-not $hkName) { $hkName = 'handkassen' }
    $lines = Set-EnvValue $lines 'HK_DB_USER'     $hkUser
    $lines = Set-EnvValue $lines 'HK_DB_PASSWORD' $hkPass
    $lines = Set-EnvValue $lines 'HK_DB_NAME'     $hkName
  } else {
    $lines = Set-EnvValue $lines 'HK_DB_PASSWORD' (New-AlnumSecret 24)
  }

  # Stunden-DB: analog nur beim Cutover abfragen
  if ($hatStunden) {
    Write-Host ""
    Info "Die bestehende Stunden-Datenbank braucht ihre urspruenglichen Zugangsdaten:"
    $stUser = Read-Host "  STUNDEN_DB_USER [stunden]";    if (-not $stUser) { $stUser = 'stunden' }
    $stPass = Read-Host "  STUNDEN_DB_PASSWORD [stunden]"; if (-not $stPass) { $stPass = 'stunden' }
    $stName = Read-Host "  STUNDEN_DB_NAME [stunden]";     if (-not $stName) { $stName = 'stunden' }
    $lines = Set-EnvValue $lines 'STUNDEN_DB_USER'     $stUser
    $lines = Set-EnvValue $lines 'STUNDEN_DB_PASSWORD' $stPass
    $lines = Set-EnvValue $lines 'STUNDEN_DB_NAME'     $stName
  } else {
    $lines = Set-EnvValue $lines 'STUNDEN_DB_PASSWORD' (New-AlnumSecret 24)
  }

  # UTF-8 OHNE BOM schreiben
  $text = ($lines -join "`n") + "`n"
  [System.IO.File]::WriteAllText($envPath, $text, (New-Object System.Text.UTF8Encoding($false)))
  Info ".env mit sicheren Zufallswerten erzeugt."
}

# --- 4. bauen & starten -----------------------------------------------------
Schritt "4/6  Container bauen und starten"
Info "Beim ersten Mal kann das einige Minuten dauern ..."
& docker compose --profile produktion up -d --build
if ($LASTEXITCODE -ne 0) { Fehler "Start fehlgeschlagen. Logs: docker compose --profile produktion logs"; Beenden 1 }

# --- 5. auf Bereitschaft warten ---------------------------------------------
Schritt "5/6  Auf Bereitschaft warten"
$bereit = $false
for ($i = 0; $i -lt 90; $i++) {
  try {
    if ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 'http://localhost/').StatusCode -eq 200) { $bereit = $true; break }
  } catch {}
  Start-Sleep -Seconds 2
}
if ($bereit) { Info "Suite ist bereit." }
else { Warnung "Suite antwortet nach ~3 Minuten noch nicht. Logs: docker compose --profile produktion logs" }

# --- 6. Bestandsnutzer-Import (nur Cutover) ---------------------------------
if ($cutover) {
  Schritt "6/6  Bestandsnutzer-Import"
  # DB-Werte aus der aktuellen .env lesen (auch bei zuvor vorhandener .env)
  $envMap = @{}
  foreach ($l in (Get-Content $envPath)) {
    if ($l -match '^\s*([A-Z0-9_]+)=(.*)$') { $envMap[$matches[1]] = $matches[2] }
  }
  $hkUrl = "postgresql://$($envMap['HK_DB_USER']):$($envMap['HK_DB_PASSWORD'])@handkassen-db:5432/$($envMap['HK_DB_NAME'])"
  $stUrl = "postgresql://$($envMap['STUNDEN_DB_USER']):$($envMap['STUNDEN_DB_PASSWORD'])@stunden-db:5432/$($envMap['STUNDEN_DB_NAME'])"

  Info "Trockenlauf (zeigt nur, was uebernommen wuerde):"
  Write-Host ""
  & docker compose --profile produktion exec -T `
      -e "HK_DATABASE_URL=$hkUrl" -e "STUNDEN_DATABASE_URL=$stUrl" `
      portal-app npx tsx scripts/import.ts
  if ($LASTEXITCODE -ne 0) {
    Warnung "Import-Trockenlauf fehlgeschlagen. Uebersprungen; spaeter manuell moeglich (siehe INSTALL.md)."
  } else {
    Write-Host ""
    $ok = Read-Host "Diese Personen jetzt uebernehmen? [j/N]"
    if ($ok -match '^(j|ja|y|yes)$') {
      & docker compose --profile produktion exec -T `
          -e "HK_DATABASE_URL=$hkUrl" -e "STUNDEN_DATABASE_URL=$stUrl" `
          portal-app npx tsx scripts/import.ts --apply
      if ($LASTEXITCODE -eq 0) { Info "Import abgeschlossen." } else { Warnung "Import fehlgeschlagen. Siehe Ausgabe oben." }
    } else { Info "Import uebersprungen." }
  }
}

# --- Abschluss --------------------------------------------------------------
Schritt "Fertig"
Info "Erreichbar unter:  http://$($env:COMPUTERNAME)    (Tools: /handkassen, /stunden)"
Info ""
Info "WICHTIG:"
Info "  * Die Datei .env enthaelt jetzt die erzeugten Geheimnisse - bitte sichern."
Info "  * Erst-Login im Portal:  admin / admin123  -> SOFORT aendern."
Info "  * HTTPS/Fernzugriff:  tailscale serve --bg https / http://localhost:80"
Beenden 0
```

- [ ] **Step 3: Syntax-check the script (no execution)**

Run:
```
powershell -NoProfile -Command "$e=$null;[System.Management.Automation.Language.Parser]::ParseFile('scripts\install.ps1',[ref]$null,[ref]$e); if($e){$e; exit 1} else {'OK'}"
```
Expected: prints `OK` (no parse errors).

- [ ] **Step 4: Verify secret helpers produce correct shapes**

Run:
```
powershell -NoProfile -Command ". { $s=Get-Content -Raw scripts\install.ps1; $s=$s.Substring(0,$s.IndexOf('Schritt \"OEHTB')); Invoke-Expression $s; 'b64='+(New-Base64Secret 48).Length; 'key='+(New-AlnumSecret 32).Length; 'env='+((Set-EnvValue @('JWT_SECRET=alt','# COOKIE_INSECURE=') 'JWT_SECRET' 'neu') -join '|') }"
```
Expected output contains: `b64=64`, `key=32`, and `env=JWT_SECRET=neu|# COOKIE_INSECURE=` (JWT line replaced, other line untouched).

- [ ] **Step 5: Dry cutover-guard check (no volumes present)**

On a machine with Docker running and **no** `handkassen_*` volumes, run `.\SERVER - Installieren.bat` and confirm step 2 reports `Keine Bestandsdaten gefunden (Neuinstallation)`. Abort before build if you don't want a full install (Ctrl+C).
Expected: reaches the HTTPS prompt in step 3 without hitting the cutover branch.

- [ ] **Step 6: Full fresh-install run**

Run `.\SERVER - Installieren.bat` on a clean host, answer `N` to HTTPS.
Expected: `.env` is created (open it — every `bitte-aendern*`/placeholder value is replaced, `COOKIE_INSECURE=1` present, `STUNDEN_ENCRYPTION_KEY` is 32 chars), stack builds and starts, health reports `Suite ist bereit.`, `http://localhost/` serves the portal login. No import step (fresh mode).

- [ ] **Step 7: Idempotency run**

Run `.\SERVER - Installieren.bat` again.
Expected: step 3 reports `Vorhandene .env gefunden - wird unveraendert beibehalten.` (compare `.env` mtime/content — unchanged), stack comes back up without error.

- [ ] **Step 8: Commit**

```bash
git add "SERVER - Installieren.bat" scripts/install.ps1
git commit -m "Installer: SERVER - Installieren.bat + install.ps1 (Ein-Klick-Deployment)"
```

---

### Task 3: Document the quick install

Add a "Schnellinstallation (Skript)" section to `INSTALL.md` so the script is the primary path and the existing manual steps remain as an explicit fallback.

**Files:**
- Modify: `INSTALL.md` (insert a new section after the intro blockquote, before `## 1. Vorbereitung`)

**Interfaces:**
- Consumes: `SERVER - Installieren.bat` from Task 2.

- [ ] **Step 1: Insert the section**

In `INSTALL.md`, directly after the closing of the intro blockquote (the paragraph ending `Im Zweifel vorher \`docker volume ls\` pruefen.`) and before the line `## 1. Vorbereitung`, insert:

```markdown
## 0. Schnellinstallation (Skript, empfohlen)

Auf dem Windows-Server genuegt ein Doppelklick auf **`SERVER - Installieren.bat`**.
Das Skript

- prueft, ob Docker laeuft,
- erkennt eine bestehende Handkassen-Installation (Cutover) automatisch,
- erzeugt beim ersten Lauf eine `.env` mit sicheren Zufallswerten
  (eine vorhandene `.env` bleibt unangetastet) und fragt nur nach, ob die Suite
  hinter HTTPS laeuft sowie – beim Cutover – nach den bestehenden
  Datenbank-Zugangsdaten,
- baut und startet alle Dienste und wartet, bis die Suite erreichbar ist,
- bietet beim Cutover den Bestandsnutzer-Import an (erst Trockenlauf, dann auf
  Nachfrage die Uebernahme).

> **Wichtig:** Eine noch laufende Alt-Installation vorher stoppen (siehe
> Abschnitt 2). Nach dem Lauf die erzeugte `.env` sichern und das
> `admin`-Passwort im Portal aendern.

Die folgenden Abschnitte beschreiben denselben Ablauf **manuell** – als
Nachschlagewerk und Fallback, falls das Skript nicht verwendet werden kann.
```

- [ ] **Step 2: Verify the render**

Run: `git diff INSTALL.md`
Expected: the new `## 0. Schnellinstallation (Skript, empfohlen)` section appears between the intro blockquote and `## 1. Vorbereitung`; no other lines changed.

- [ ] **Step 3: Commit**

```bash
git add INSTALL.md
git commit -m "INSTALL.md: Abschnitt Schnellinstallation (Skript) ergaenzt"
```

---

## Notes for the implementer

- Tasks 1 and 2's Docker verification steps require Docker Desktop running on a Windows host. If you are implementing on a machine without Docker, complete Task 2 steps 3–4 (parse + helper checks, which need only PowerShell) and defer steps 5–7 to the client server, noting them as pending.
- Do not attempt to `git add .env` — it is gitignored ([.gitignore](.gitignore)) and must never be committed.

# ===========================================================================
#  Stunden-Tool OEHTB – Ersteinrichtung
#  Einmalig ausfuehren beim ersten Start des Projekts.
#  Spaeter genuegt start.ps1.
# ===========================================================================

$ErrorActionPreference = "Stop"
$projekt = $PSScriptRoot

Write-Host ""
Write-Host "=== Stunden-Tool OEHTB: Ersteinrichtung ===" -ForegroundColor Cyan
Write-Host ""

# --- 1. Docker pruefen und DB starten ---
Write-Host "[1/5] Datenbank (Docker) starten ..." -ForegroundColor Yellow
try {
    docker info *> $null
} catch {
    Write-Host "FEHLER: Docker laeuft nicht. Bitte Docker Desktop starten und erneut versuchen." -ForegroundColor Red
    exit 1
}
Set-Location $projekt
docker compose up -d db
Write-Host "      Datenbank laeuft auf Port 5433." -ForegroundColor Green

# Kurz warten, bis Postgres bereit ist
Write-Host "      Warte auf Datenbank ..." -ForegroundColor Gray
Start-Sleep -Seconds 5

# --- 2. Backend-Abhaengigkeiten ---
Write-Host "[2/5] Backend-Pakete installieren ..." -ForegroundColor Yellow
Set-Location "$projekt\backend"
npm install

# --- 3. Prisma generieren + migrieren ---
Write-Host "[3/5] Datenbank-Schema anlegen (Prisma) ..." -ForegroundColor Yellow
# Hinweis ARM64: Backend darf hier nicht laufen (EPERM).
npx prisma generate
npx prisma migrate dev --name init

# --- 4. Testdaten + Admin anlegen ---
Write-Host "[4/5] Testdaten und Admin-Benutzer anlegen ..." -ForegroundColor Yellow
npm run seed

# --- 5. Frontend-Abhaengigkeiten ---
Write-Host "[5/5] Frontend-Pakete installieren ..." -ForegroundColor Yellow
Set-Location "$projekt\frontend"
npm install

Set-Location $projekt
Write-Host ""
Write-Host "=== Einrichtung abgeschlossen ===" -ForegroundColor Green
Write-Host ""
Write-Host "Starte das Projekt ab jetzt mit:  .\start.ps1" -ForegroundColor Cyan
Write-Host ""
Write-Host "Anmeldung:" -ForegroundColor Cyan
Write-Host "  E-Mail:   admin@oehtb.local"
Write-Host "  Passwort: admin123  (vor Produktivbetrieb aendern!)"
Write-Host ""

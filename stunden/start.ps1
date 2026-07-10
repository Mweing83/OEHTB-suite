# ===========================================================================
#  Stunden-Tool OEHTB – Start
#  Startet Datenbank, Backend und Frontend.
#  Voraussetzung: einrichten.ps1 wurde einmal ausgefuehrt.
# ===========================================================================

$ErrorActionPreference = "Stop"
$projekt = $PSScriptRoot

Write-Host ""
Write-Host "=== Stunden-Tool OEHTB: Start ===" -ForegroundColor Cyan
Write-Host ""

# --- 1. Docker pruefen ---
try {
    docker info *> $null
} catch {
    Write-Host "FEHLER: Docker laeuft nicht. Bitte Docker Desktop starten." -ForegroundColor Red
    exit 1
}

# --- 2. Datenbank starten ---
Write-Host "Datenbank starten ..." -ForegroundColor Yellow
Set-Location $projekt
docker compose up -d db
Write-Host "  Datenbank laeuft (Port 5433)." -ForegroundColor Green

# --- 3. Backend in neuem Fenster ---
Write-Host "Backend starten (eigenes Fenster) ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$projekt\backend'; Write-Host 'BACKEND (Port 3002)' -ForegroundColor Cyan; npm run dev"
)

# --- 4. Frontend in neuem Fenster ---
Write-Host "Frontend starten (eigenes Fenster) ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$projekt\frontend'; Write-Host 'FRONTEND (Port 5174)' -ForegroundColor Cyan; npm run dev"
)

Write-Host ""
Write-Host "=== Gestartet ===" -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend:  http://localhost:5174" -ForegroundColor Cyan
Write-Host "  Backend:   http://localhost:3002/api/health" -ForegroundColor Cyan
Write-Host ""
Write-Host "Backend und Frontend laufen in eigenen Fenstern." -ForegroundColor Gray
Write-Host "Zum Beenden die beiden Fenster schliessen." -ForegroundColor Gray
Write-Host ""

# Browser oeffnen (kurz warten, bis Vite bereit ist)
Start-Sleep -Seconds 3
Start-Process "http://localhost:5174"

# ===========================================================================
#  Stunden-Tool OEHTB – Stopp
#  Faehrt die Datenbank herunter. Backend-/Frontend-Fenster bitte
#  manuell schliessen (oder Strg+C darin).
# ===========================================================================

$projekt = $PSScriptRoot
Set-Location $projekt

Write-Host "Datenbank herunterfahren ..." -ForegroundColor Yellow
docker compose down
Write-Host "Erledigt." -ForegroundColor Green

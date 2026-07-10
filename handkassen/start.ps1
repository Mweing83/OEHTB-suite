# ============================================================
#  ÖHTB Handkassen – Startskript
#  Startet Datenbank, Backend und Frontend mit einem Klick.
#  Beim ersten Lauf wird automatisch eingerichtet (install,
#  prisma generate, migrate, seed). Danach nur noch starten.
# ============================================================

# In den Ordner wechseln, in dem dieses Skript liegt
Set-Location -Path $PSScriptRoot

function Schritt($text) {
    Write-Host ""
    Write-Host "==> $text" -ForegroundColor Cyan
}

function Fehler($text) {
    Write-Host ""
    Write-Host "FEHLER: $text" -ForegroundColor Red
    Write-Host "Druecke eine Taste zum Beenden..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

Write-Host "============================================" -ForegroundColor White
Write-Host "  OEHTB Handkassen - Start" -ForegroundColor White
Write-Host "============================================" -ForegroundColor White

# ---------- 1. Pruefen, ob Docker laeuft ----------
Schritt "Pruefe Docker..."
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker Desktop laeuft noch nicht. Versuche es zu starten..." -ForegroundColor Yellow
    $dockerPfad = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerPfad) {
        Start-Process $dockerPfad
        Write-Host "Warte, bis Docker bereit ist (das kann 1-2 Minuten dauern)..."
        $versuche = 0
        do {
            Start-Sleep -Seconds 5
            docker info *> $null
            $versuche++
            if ($versuche -gt 36) { Fehler "Docker ist nicht rechtzeitig gestartet. Bitte Docker Desktop manuell oeffnen und Skript erneut starten." }
        } while ($LASTEXITCODE -ne 0)
    } else {
        Fehler "Docker Desktop wurde nicht gefunden. Bitte zuerst Docker Desktop oeffnen und dann das Skript erneut starten."
    }
}
Write-Host "Docker laeuft." -ForegroundColor Green

# ---------- 2. .env sicherstellen ----------
Schritt "Pruefe Konfiguration (.env)..."
if (-not (Test-Path ".\.env")) {
    Copy-Item ".\.env.example" ".\.env"
    Write-Host ".env im Hauptordner erstellt." -ForegroundColor Green
}
if (-not (Test-Path ".\backend\.env")) {
    Copy-Item ".\.env.example" ".\backend\.env"
    # ARM64-Einstellungen nur anhaengen, falls sie nicht schon aus .env.example stammen
    $inhalt = Get-Content ".\backend\.env" -Raw
    if ($inhalt -notmatch "PRISMA_CLIENT_ENGINE_TYPE") {
        Add-Content ".\backend\.env" "`nPRISMA_CLIENT_ENGINE_TYPE=binary`nPRISMA_CLI_QUERY_ENGINE_TYPE=binary"
    }
    Write-Host "backend\.env erstellt (inkl. ARM64-Einstellungen)." -ForegroundColor Green
}

# ---------- 3. Datenbank starten ----------
Schritt "Starte Datenbank..."
docker compose up -d db
if ($LASTEXITCODE -ne 0) { Fehler "Datenbank konnte nicht gestartet werden." }

Write-Host "Warte, bis die Datenbank bereit ist..."
$versuche = 0
do {
    Start-Sleep -Seconds 2
    docker compose exec -T db pg_isready -U handkassen *> $null
    $versuche++
    if ($versuche -gt 30) { Fehler "Datenbank wurde nicht rechtzeitig bereit." }
} while ($LASTEXITCODE -ne 0)
Write-Host "Datenbank ist bereit." -ForegroundColor Green

# ---------- 3b. Datensicherung (Backup-Dienst) starten ----------
Schritt "Starte Datensicherung (Backup-Dienst)..."
docker compose --profile produktion up -d backup
if ($LASTEXITCODE -ne 0) {
    Write-Host "Hinweis: Backup-Dienst konnte nicht gestartet werden (nicht kritisch, App startet trotzdem)." -ForegroundColor Yellow
} else {
    Write-Host "Backup-Dienst laeuft." -ForegroundColor Green
}

# ---------- 4. Backend einrichten (nur beim ersten Mal) ----------
Schritt "Pruefe Backend-Einrichtung..."
Push-Location ".\backend"

if (-not (Test-Path ".\node_modules")) {
    Write-Host "Erstmalige Einrichtung des Backends (das dauert ein paar Minuten)..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) { Pop-Location; Fehler "npm install (backend) fehlgeschlagen." }
    npx prisma generate
    if ($LASTEXITCODE -ne 0) { Pop-Location; Fehler "prisma generate fehlgeschlagen." }
    npx prisma migrate deploy
    if ($LASTEXITCODE -ne 0) { Pop-Location; Fehler "prisma migrate fehlgeschlagen." }
    npm run seed
    if ($LASTEXITCODE -ne 0) { Pop-Location; Fehler "seed fehlgeschlagen." }
    Write-Host "Backend eingerichtet." -ForegroundColor Green
} else {
    # Auch bei Folgestarts sicherstellen, dass die DB-Struktur aktuell ist
    npx prisma migrate deploy *> $null
    Write-Host "Backend bereits eingerichtet." -ForegroundColor Green
}
Pop-Location

# ---------- 5. Frontend einrichten (nur beim ersten Mal) ----------
Schritt "Pruefe Frontend-Einrichtung..."
Push-Location ".\frontend"
if (-not (Test-Path ".\node_modules")) {
    Write-Host "Erstmalige Einrichtung des Frontends (das dauert ein paar Minuten)..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) { Pop-Location; Fehler "npm install (frontend) fehlgeschlagen." }
    Write-Host "Frontend eingerichtet." -ForegroundColor Green
} else {
    Write-Host "Frontend bereits eingerichtet." -ForegroundColor Green
}
Pop-Location

# ---------- 6. Backend und Frontend in eigenen Fenstern starten ----------
Schritt "Starte Backend und Frontend..."

Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$PSScriptRoot\backend'; Write-Host 'BACKEND - dieses Fenster offen lassen' -ForegroundColor Green; npm run dev"
)

Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$PSScriptRoot\frontend'; Write-Host 'FRONTEND - dieses Fenster offen lassen' -ForegroundColor Green; npm run dev"
)

# ---------- 7. Browser oeffnen ----------
Write-Host ""
Write-Host "Warte kurz, dann oeffne ich den Browser..." -ForegroundColor Cyan
Start-Sleep -Seconds 8
Start-Process "http://localhost:5173"

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Fertig! Die Anwendung startet." -ForegroundColor Green
Write-Host "  Browser: http://localhost:5173" -ForegroundColor Green
Write-Host "  Login:   admin / admin123" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Es haben sich zwei Fenster geoeffnet (Backend + Frontend)."
Write-Host "Diese bitte geoeffnet lassen, solange du arbeitest."
Write-Host "Zum Beenden einfach beide Fenster schliessen."
Write-Host ""
Write-Host "Du kannst dieses Fenster jetzt schliessen."
Start-Sleep -Seconds 3

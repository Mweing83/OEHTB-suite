# ============================================================
#  OEHTB Handkassen - Wiederherstellung (Restore)
#  Laesst eine vorhandene Sicherung auswaehlen und spielt sie
#  zurueck. Vor dem Ueberschreiben legt das Restore-Skript
#  automatisch eine Sicherheitskopie des aktuellen Standes an.
# ============================================================

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

# Liest einen Wert aus der .env (oder gibt den Standard zurueck).
function Get-EnvWert($schluessel, $standard) {
    if (Test-Path ".\.env") {
        $treffer = Select-String -Path ".\.env" -Pattern "^\s*$schluessel\s*=" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($treffer) {
            $wert = ($treffer.Line -replace "^\s*$schluessel\s*=\s*", "").Trim().Trim('"').Trim("'")
            if ($wert) { return $wert }
        }
    }
    return $standard
}

Write-Host "============================================" -ForegroundColor White
Write-Host "  OEHTB Handkassen - Wiederherstellung" -ForegroundColor White
Write-Host "============================================" -ForegroundColor White

# ---------- 1. Docker pruefen ----------
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
            if ($versuche -gt 36) { Fehler "Docker ist nicht rechtzeitig gestartet. Bitte Docker Desktop manuell oeffnen und erneut versuchen." }
        } while ($LASTEXITCODE -ne 0)
    } else {
        Fehler "Docker Desktop wurde nicht gefunden. Bitte zuerst Docker Desktop oeffnen und das Skript erneut starten."
    }
}
Write-Host "Docker laeuft." -ForegroundColor Green

# ---------- 2. Konfiguration lesen ----------
$pgUser = Get-EnvWert "POSTGRES_USER" "handkassen"
$pgPass = Get-EnvWert "POSTGRES_PASSWORD" "handkassen"
$pgDb   = Get-EnvWert "POSTGRES_DB" "handkassen"

# ---------- 3. Datenbank sicherstellen ----------
Schritt "Pruefe Datenbank..."
$dbId = (docker compose ps -q db 2>$null)
if (-not $dbId) {
    docker compose up -d db | Out-Null
    if ($LASTEXITCODE -ne 0) { Fehler "Datenbank konnte nicht gestartet werden." }
}
$versuche = 0
do {
    Start-Sleep -Seconds 2
    docker compose exec -T db pg_isready -U $pgUser *> $null
    $versuche++
    if ($versuche -gt 30) { Fehler "Datenbank wurde nicht rechtzeitig bereit." }
} while ($LASTEXITCODE -ne 0)
$dbId = (docker compose ps -q db 2>$null)
Write-Host "Datenbank ist bereit." -ForegroundColor Green

# ---------- 4. Vorhandene Sicherungen auflisten ----------
Schritt "Suche vorhandene Sicherungen..."
$backupsRoot = Join-Path $PSScriptRoot "backups"
if (-not (Test-Path $backupsRoot)) { Fehler "Ordner 'backups' nicht gefunden. Wurde schon einmal gesichert?" }

$dateien = Get-ChildItem -Path $backupsRoot -Recurse -Filter "handkassen_*.tar.gz" -File -ErrorAction SilentlyContinue |
           Sort-Object LastWriteTime -Descending
if (-not $dateien -or @($dateien).Count -eq 0) { Fehler "Keine Sicherungen gefunden unter $backupsRoot." }
$dateien = @($dateien)

Write-Host ""
Write-Host "Verfuegbare Sicherungen (neueste zuerst):" -ForegroundColor White
Write-Host ""
$i = 1
foreach ($d in $dateien) {
    $rel = $d.FullName.Substring($backupsRoot.Length).TrimStart('\')
    $mb = [math]::Round($d.Length / 1MB, 2)
    Write-Host ("{0,3}.  {1,-45} {2}  {3} MB" -f $i, $rel, $d.LastWriteTime.ToString("yyyy-MM-dd HH:mm"), $mb)
    $i++
}
Write-Host ""

# ---------- 5. Auswahl ----------
$wahl = Read-Host "Nummer der gewuenschten Sicherung (oder leer = Abbruch)"
if ([string]::IsNullOrWhiteSpace($wahl)) { Write-Host "Abgebrochen."; Start-Sleep 2; exit 0 }
if (-not ($wahl -as [int]) -or [int]$wahl -lt 1 -or [int]$wahl -gt $dateien.Count) { Fehler "Ungueltige Auswahl." }
$gewaehlt = $dateien[[int]$wahl - 1]
$relWahl  = $gewaehlt.FullName.Substring($backupsRoot.Length).TrimStart('\')
$containerArchiv = "/backups/lokal/" + ($relWahl -replace '\\', '/')

# ---------- 6. Sicherheitsabfrage ----------
Write-Host ""
Write-Host "ACHTUNG: Die aktuelle Datenbank und die Belegfotos werden ueberschrieben!" -ForegroundColor Red
Write-Host "Gewaehlte Sicherung: $relWahl" -ForegroundColor Yellow
Write-Host "Vor dem Ueberschreiben wird automatisch eine Sicherheitskopie des aktuellen Standes erstellt" -ForegroundColor Gray
Write-Host "(Ordner backups\vor-restore\) - ein Versehen laesst sich damit rueckgaengig machen." -ForegroundColor Gray
Write-Host ""
$ok = Read-Host "Zum Fortfahren 'JA' eingeben"
if ($ok -ne "JA") { Write-Host "Abgebrochen."; Start-Sleep 2; exit 0 }

# ---------- 7. Backend stoppen (manuell, sicher) ----------
Write-Host ""
Write-Host "Bitte schliesse JETZT das 'BACKEND'-Fenster (falls offen)," -ForegroundColor Yellow
Write-Host "damit die Datenbankverbindungen frei sind." -ForegroundColor Yellow
Write-Host "Druecke danach eine Taste, um die Wiederherstellung zu starten..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# ---------- 8. Docker-Netzwerk der Datenbank ermitteln ----------
$net = "handkassen_default"
if ($dbId) {
    $erkannt = (docker inspect $dbId --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>$null)
    if ($erkannt) { $net = $erkannt.Trim() }
}

# ---------- 9. Wiederherstellung ausfuehren ----------
Schritt "Spiele Sicherung zurueck..."
$root = $PSScriptRoot -replace '\\', '/'
$dockerArgs = @(
    "run", "--rm",
    "--network", $net,
    "-e", "POSTGRES_USER=$pgUser",
    "-e", "POSTGRES_PASSWORD=$pgPass",
    "-e", "POSTGRES_DB=$pgDb",
    "-e", "DB_HOST=db",
    "-v", "$root/backend/uploads:/uploads",
    "-v", "$root/backup:/backup:ro",
    "-v", "$root/backups:/backups/lokal",
    "postgres:16-alpine", "/bin/sh", "/backup/restore.sh",
    $containerArchiv
)
docker @dockerArgs
if ($LASTEXITCODE -ne 0) { Fehler "Die Wiederherstellung ist fehlgeschlagen. Bitte die Ausgabe oben pruefen." }

# ---------- 10. Fertig ----------
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Wiederherstellung abgeschlossen." -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "Starte die Anwendung nun wieder ueber 'Handkassen starten.bat'." -ForegroundColor White
Write-Host "Eine Sicherheitskopie des vorherigen Standes liegt im Ordner backups\vor-restore\." -ForegroundColor Gray
Write-Host ""
Write-Host "Druecke eine Taste zum Beenden..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

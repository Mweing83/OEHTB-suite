# ============================================================
#  OEHTB-Suite - Schutz der Datenbank-Volumes vor fremden Containern
#
#  Wird von "SERVER - Starten.bat" und "SERVER - Aktualisieren.bat"
#  VOR "docker compose up" aufgerufen. Bricht ab (Exit-Code 1), wenn
#  ein Container, der NICHT zum Compose-Projekt "oehtb-suite" gehoert,
#  eines der Suite-Volumes eingebunden hat (z. B. ein per Hand gestarteter
#  Postgres-Container oder ein Rest einer frueheren Installation).
#
#  Hintergrund: Am 13.10.2026 liefen kurzzeitig zwei PostgreSQL-Instanzen
#  auf dem Volume handkassen_db_data. Das hat die Produktivdatenbank
#  beschaedigt. Zwei Postgres-Prozesse auf einem Datenverzeichnis =
#  Datenverlust, deshalb hier ein harter Stopp.
# ============================================================

$ErrorActionPreference = "SilentlyContinue"
$projekt = "oehtb-suite"
$volumes = @(
    "handkassen_db_data",
    "handkassen_belege_data",
    "stunden_db_data",
    "foerderungen_db_data",
    "oehtb-suite_suite_db_data"
)

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "FEHLER: Docker ist nicht erreichbar (laeuft Docker Desktop?)." -ForegroundColor Red
    exit 1
}

$treffer = @()
foreach ($vol in $volumes) {
    $alle   = @(docker ps -a --filter "volume=$vol" --format "{{.Names}}|{{.Status}}" 2>$null | Where-Object { $_ })
    $eigene = @(docker ps -a --filter "volume=$vol" --filter "label=com.docker.compose.project=$projekt" --format "{{.Names}}|{{.Status}}" 2>$null | Where-Object { $_ })
    foreach ($zeile in $alle) {
        if ($eigene -notcontains $zeile) {
            $teile = $zeile -split '\|', 2
            $treffer += [pscustomobject]@{ Volume = $vol; Container = $teile[0]; Status = $teile[1] }
        }
    }
}

if ($treffer.Count -eq 0) {
    Write-Host "Volume-Schutz: keine fremden Container an den Suite-Volumes." -ForegroundColor Green
    exit 0
}

Write-Host ""
Write-Host "ABBRUCH: Fremde Container haengen an Suite-Volumes!" -ForegroundColor Red
Write-Host "Ein Start der Suite koennte dazu fuehren, dass zwei Datenbank-Instanzen" -ForegroundColor Red
Write-Host "gleichzeitig in dasselbe Datenverzeichnis schreiben (Datenverlust)." -ForegroundColor Red
Write-Host ""
foreach ($t in $treffer) {
    Write-Host ("  Volume {0,-28} Container {1,-40} Status: {2}" -f $t.Volume, $t.Container, $t.Status) -ForegroundColor Yellow
}
Write-Host ""
Write-Host "So beheben:" -ForegroundColor White
Write-Host "  1. Laeuft der Container ('Up ...')? Dann stoppen:   docker stop <Container>" -ForegroundColor White
Write-Host "  2. Wird er nicht mehr gebraucht? Dann entfernen:   docker rm <Container>" -ForegroundColor White
Write-Host "     (Entfernen eines Containers loescht KEINE Volumes/Daten.)" -ForegroundColor White
Write-Host "  3. Danach dieses Skript erneut starten." -ForegroundColor White
Write-Host ""
Write-Host "Die Suite ist der einzige Betriebsweg; Container ausserhalb von 'oehtb-suite'" -ForegroundColor Gray
Write-Host "duerfen die Suite-Volumes nicht benutzen." -ForegroundColor Gray
Write-Host ""
exit 1

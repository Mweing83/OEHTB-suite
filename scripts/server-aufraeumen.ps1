# ============================================================
#  OEHTB-Suite - Aufraeumen der Standalone-Altlasten auf dem Server
#
#  Entfernt Reste aus der Zeit, als die Handkasse noch eigenstaendig
#  (Unterordner handkassen\) betrieben wurde. Die Suite ist seit dem
#  13.10.2026 der einzige Betriebsweg.
#
#  NUR auf dem Produktivserver ausfuehren (Suite-Root, PowerShell, Docker laeuft):
#    powershell -ExecutionPolicy Bypass -File .\scripts\server-aufraeumen.ps1
#        -> TROCKENLAUF: zeigt nur, was entfernt WUERDE. Aendert nichts.
#    powershell -ExecutionPolicy Bypass -File .\scripts\server-aufraeumen.ps1 -Ausfuehren
#        -> fuehrt die Schritte nach einer Rueckfrage ("JA") aus.
#    ... -Ausfuehren -MitDefektVolume
#        -> entfernt ZUSAETZLICH das aufbewahrte defekte Datenverzeichnis
#           (Volume handkassen_db_data_defekt_20261013) und den Ordner
#           handkassen\backups\SICHER_vor_Reparatur_20261013. Erst nach
#           einigen stabilen Tagen und mit eigener Rueckfrage.
#
#  Was das Skript NIE anfasst:
#    - laufende Container (werden nur gemeldet)
#    - Container/Volumes/Images des Compose-Projekts "oehtb-suite"
#    - die Suite-Volumes (handkassen_db_data, handkassen_belege_data,
#      stunden_db_data, foerderungen_db_data, oehtb-suite_suite_db_data)
#    - anonyme Volumes, die an irgendeinem Container haengen
#    - die Backup-Ordner handkassen\backups* (Suite-Sicherungen)
# ============================================================

param(
    [switch]$Ausfuehren,
    [switch]$MitDefektVolume
)

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$projekt = "oehtb-suite"
$suiteVolumes = @(
    "handkassen_db_data", "handkassen_belege_data",
    "stunden_db_data", "foerderungen_db_data", "oehtb-suite_suite_db_data"
)
$defektVolume = "handkassen_db_data_defekt_20261013"
$sicherOrdner = Join-Path $root "handkassen\backups\SICHER_vor_Reparatur_20261013"

function Titel($t) { Write-Host ""; Write-Host "== $t" -ForegroundColor Cyan }
function Plan($t)  { Write-Host "   [entfernen] $t" -ForegroundColor Yellow }
function Info($t)  { Write-Host "   $t" -ForegroundColor Gray }
function Ok($t)    { Write-Host "   $t" -ForegroundColor Green }

Write-Host "OEHTB-Suite - Aufraeumen der Standalone-Altlasten" -ForegroundColor White
if ($Ausfuehren) { Write-Host "Modus: AUSFUEHREN (nach Rueckfrage)" -ForegroundColor Red }
else             { Write-Host "Modus: Trockenlauf - es wird NICHTS geaendert. Ausfuehren mit -Ausfuehren." -ForegroundColor Green }

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "FEHLER: Docker ist nicht erreichbar (laeuft Docker Desktop?)." -ForegroundColor Red
    exit 1
}

# Nur auf einem Suite-Server sinnvoll: Ohne Container des Projekts "oehtb-suite"
# (z. B. auf einem Entwicklungsrechner) wird im Ausfuehren-Modus abgebrochen,
# damit nicht versehentlich fremde Docker-Reste geloescht werden.
$suiteContainer = @(docker ps -a --filter "label=com.docker.compose.project=$projekt" -q 2>$null | Where-Object { $_ })
if ($suiteContainer.Count -eq 0) {
    Write-Host "HINWEIS: Keine Container des Compose-Projekts '$projekt' gefunden - das ist kein Suite-Server." -ForegroundColor Yellow
    if ($Ausfuehren) { Write-Host "Ausfuehren-Modus hier nicht erlaubt. Abbruch." -ForegroundColor Red; exit 1 }
}

# Sammelt alle geplanten Aktionen als ScriptBlocks mit Beschreibung.
$aktionen = @()
function Vormerken($beschreibung, [scriptblock]$tun) {
    Plan $beschreibung
    $script:aktionen += [pscustomobject]@{ Was = $beschreibung; Tun = $tun }
}

# ---------------------------------------------------------------- 1. Dateien
Titel "1. Untracked Dateireste in handkassen\ (aus der Standalone-Zeit)"
$dateiReste = @("handkassen\.env", "handkassen\.git-DISABLED", "handkassen\.claude")
$gefunden = $false
foreach ($rel in $dateiReste) {
    $pfad = Join-Path $root $rel
    if (Test-Path $pfad) {
        $gefunden = $true
        $p = $pfad
        Vormerken "Datei/Ordner $rel" { Remove-Item -Recurse -Force $p }
    }
}
# Alles, was git nach dem Update als untracked in handkassen\ sieht, nur anzeigen.
$untracked = git status --porcelain --untracked-files=all -- handkassen 2>$null | Where-Object { $_ -like "??*" }
if ($untracked) {
    Info "Weitere untracked Dateien unter handkassen\ (werden NICHT angefasst, bitte selbst pruefen):"
    foreach ($u in $untracked) { Info ("     " + $u.Substring(3)) }
}
if (-not $gefunden) { Ok "keine Dateireste gefunden." }

# ---------------------------------------------------------------- 2. Container
Titel "2. Container ausserhalb des Compose-Projekts '$projekt'"
$alle   = @(docker ps -a --format "{{.Names}}|{{.Status}}|{{.Image}}" 2>$null | Where-Object { $_ })
$eigene = @(docker ps -a --filter "label=com.docker.compose.project=$projekt" --format "{{.Names}}|{{.Status}}|{{.Image}}" 2>$null | Where-Object { $_ })
$fremde = @($alle | Where-Object { $eigene -notcontains $_ })
if ($fremde.Count -eq 0) { Ok "keine fremden Container." }
foreach ($z in $fremde) {
    $t = $z -split '\|', 3
    $name = $t[0]; $status = $t[1]; $image = $t[2]
    if ($status -like "Up*") {
        Info "LAEUFT, wird nicht angefasst: $name ($image, $status) - bitte selbst pruefen, ob er gebraucht wird."
    } else {
        $n = $name
        Vormerken "Container $name ($image, $status)" { docker rm -f $n | Out-Null }
    }
}

# ---------------------------------------------------------------- 3. Images
Titel "3. Alte Images des Standalone-Builds (handkassen-app) und haengende Images"
$alteImages = @(docker images --filter "reference=handkassen-app" --format "{{.Repository}}:{{.Tag}}|{{.ID}}" 2>$null | Where-Object { $_ })
if ($alteImages.Count -eq 0) { Ok "kein Image 'handkassen-app' vorhanden." }
foreach ($z in $alteImages) {
    $t = $z -split '\|', 2
    $id = $t[1]
    Vormerken "Image $($t[0]) ($id)" { docker rmi -f $id | Out-Null }
}
$haengend = @(docker images --filter "dangling=true" -q 2>$null | Where-Object { $_ })
if ($haengend.Count -gt 0) {
    Vormerken "$($haengend.Count) haengende Image-Schicht(en) (docker image prune)" { docker image prune -f | Out-Null }
} else { Ok "keine haengenden Images." }

# ---------------------------------------------------------------- 4. Anonyme Volumes
Titel "4. Anonyme Volumes, die an keinem Container mehr haengen"
$dangling = @(docker volume ls --filter "dangling=true" --format "{{.Name}}" 2>$null | Where-Object { $_ })
$anonym = @($dangling | Where-Object { $_ -match '^[0-9a-f]{64}$' })
if ($anonym.Count -eq 0) { Ok "keine verwaisten anonymen Volumes." }
foreach ($v in $anonym) {
    if ($suiteVolumes -contains $v) { continue }
    # Doppelt pruefen: haengt wirklich kein Container daran?
    $nutzer = @(docker ps -a --filter "volume=$v" --format "{{.Names}}" 2>$null | Where-Object { $_ })
    if ($nutzer.Count -gt 0) { Info "uebersprungen (in Benutzung durch $($nutzer -join ', ')): $v"; continue }
    $vol = $v
    Vormerken "anonymes Volume $($v.Substring(0,12))..." { docker volume rm $vol | Out-Null }
}
# Benannte verwaiste Volumes nur melden (z. B. aus einer frueheren Installation).
$benanntVerwaist = @($dangling | Where-Object { $_ -notmatch '^[0-9a-f]{64}$' -and $suiteVolumes -notcontains $_ -and $_ -ne $defektVolume })
foreach ($v in $benanntVerwaist) { Info "benanntes Volume ohne Container (nicht angefasst, bitte pruefen): $v" }

# ---------------------------------------------------------------- 5. Defektes Datenverzeichnis (optional)
Titel "5. Aufbewahrtes defektes Datenverzeichnis vom 13.10.2026"
$defektDa = @(docker volume ls --filter "name=^$defektVolume$" --format "{{.Name}}" 2>$null | Where-Object { $_ }).Count -gt 0
$sicherDa = Test-Path $sicherOrdner
if (-not $defektDa -and -not $sicherDa) {
    Ok "nichts mehr vorhanden."
} elseif ($MitDefektVolume) {
    if ($defektDa) {
        $nutzer = @(docker ps -a --filter "volume=$defektVolume" --format "{{.Names}}" 2>$null | Where-Object { $_ })
        if ($nutzer.Count -gt 0) { Info "Volume $defektVolume ist in Benutzung ($($nutzer -join ', ')) - nicht angefasst." }
        else { Vormerken "Volume $defektVolume (bitgleiche Kopie des defekten Datenverzeichnisses)" { docker volume rm $defektVolume | Out-Null } }
    }
    if ($sicherDa) { Vormerken "Ordner handkassen\backups\SICHER_vor_Reparatur_20261013" { Remove-Item -Recurse -Force $sicherOrdner } }
} else {
    if ($defektDa) { Info "Volume $defektVolume bleibt (erst mit -MitDefektVolume)." }
    if ($sicherDa) { Info "Ordner SICHER_vor_Reparatur_20261013 bleibt (erst mit -MitDefektVolume)." }
}

# ---------------------------------------------------------------- Ausfuehren?
Titel "Zusammenfassung"
if ($aktionen.Count -eq 0) {
    Ok "Nichts zu tun."
    exit 0
}
Write-Host ("   {0} Aktion(en) vorgemerkt." -f $aktionen.Count)
if (-not $Ausfuehren) {
    Write-Host ""
    Write-Host "Trockenlauf beendet. Zum Ausfuehren:" -ForegroundColor Green
    Write-Host "   powershell -ExecutionPolicy Bypass -File .\scripts\server-aufraeumen.ps1 -Ausfuehren" -ForegroundColor White
    exit 0
}

Write-Host ""
Write-Host "ACHTUNG: Die oben mit [entfernen] markierten Punkte werden jetzt geloescht." -ForegroundColor Red
if ($MitDefektVolume) {
    Write-Host "Darunter das aufbewahrte defekte Datenverzeichnis - danach ist keine Ursachenanalyse mehr moeglich." -ForegroundColor Red
}
$antwort = Read-Host "Zum Fortfahren 'JA' eingeben"
if ($antwort -ne "JA") { Write-Host "Abgebrochen, nichts geaendert."; exit 0 }

$fehler = 0
foreach ($a in $aktionen) {
    try {
        & $a.Tun
        if ($LASTEXITCODE -is [int] -and $LASTEXITCODE -ne 0) { throw "Exit-Code $LASTEXITCODE" }
        Ok ("entfernt: " + $a.Was)
    } catch {
        $fehler++
        Write-Host ("   FEHLER bei: " + $a.Was + " - " + $_.Exception.Message) -ForegroundColor Red
    }
}

Write-Host ""
if ($fehler -eq 0) { Write-Host "Fertig. Alle vorgemerkten Punkte entfernt." -ForegroundColor Green; exit 0 }
Write-Host ("Fertig mit {0} Fehler(n) - bitte die Meldungen oben pruefen." -f $fehler) -ForegroundColor Yellow
exit 1

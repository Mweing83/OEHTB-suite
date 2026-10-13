# ============================================================
#  OEHTB-Suite - Sofort-Sicherung + Plausibilitaetscheck beim Update
#
#  Aufruf (durch "SERVER - Aktualisieren.bat"):
#    -Phase vorher   VOR dem Neubau der Container:
#                    pg_dump aller vier Datenbanken nach
#                    backups-vor-update\<Zeitstempel>\<dienst>.dump
#                    + Zeilenzahlen aller Tabellen (zaehlung.json)
#    -Phase nachher  NACH dem Start:
#                    Zeilenzahlen erneut ermitteln und mit der letzten
#                    Zaehlung vergleichen. Weniger Zeilen als vorher =
#                    Warnung (Exit-Code 2), sonst Exit-Code 0.
#
#  Exit-Codes: 0 ok, 1 Fehler (Update soll abgebrochen werden),
#              2 Warnung (Plausibilitaetscheck meldet Abweichungen).
#
#  Hintergrund: Am 13.10.2026 ging beim Update eine Datenbank kaputt;
#  erst ein Blick in die Oberflaeche zeigte es. Diese Sicherung liegt
#  unabhaengig vom naechtlichen Backup direkt vor dem Update, und der
#  Vergleich meldet sofort, wenn nach dem Update Daten "fehlen".
# ============================================================

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("vorher", "nachher")]
    [string]$Phase
)

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$compose = @("compose", "--profile", "produktion")
$zielRoot = Join-Path $root "backups-vor-update"
$behalten = 10   # so viele Update-Sicherungen bleiben liegen, aeltere werden entfernt

# Liest einen Wert aus der .env (oder liefert den Standard).
function Get-EnvWert($schluessel, $standard) {
    if (Test-Path ".\.env") {
        $treffer = Select-String -Path ".\.env" -Pattern "^\s*$schluessel\s*=" | Select-Object -First 1
        if ($treffer) {
            $wert = ($treffer.Line -replace "^\s*$schluessel\s*=\s*", "").Trim().Trim('"').Trim("'")
            if ($wert) { return $wert }
        }
    }
    return $standard
}

$datenbanken = @(
    @{ Dienst = "suite-db";        User = (Get-EnvWert "SUITE_DB_USER" "suite");               Db = (Get-EnvWert "SUITE_DB_NAME" "suite") },
    @{ Dienst = "handkassen-db";   User = (Get-EnvWert "HK_DB_USER" "handkassen");             Db = (Get-EnvWert "HK_DB_NAME" "handkassen") },
    @{ Dienst = "stunden-db";      User = (Get-EnvWert "STUNDEN_DB_USER" "stunden");           Db = (Get-EnvWert "STUNDEN_DB_NAME" "stunden") },
    @{ Dienst = "foerderungen-db"; User = (Get-EnvWert "FOERDERUNGEN_DB_USER" "foerderungen"); Db = (Get-EnvWert "FOERDERUNGEN_DB_NAME" "foerderungen") }
)

# Exakte Zeilenzahlen aller Tabellen im Schema public, eine Zeile je Tabelle: "tabelle|anzahl".
$zaehlSql = "SELECT table_name || '|' || (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1;"

function Test-DienstLaeuft($dienst) {
    $id = docker @compose ps --status running -q $dienst 2>$null
    return [bool]$id
}

function Get-Zeilenzahlen($eintrag) {
    $zeilen = docker @compose exec -T $eintrag.Dienst psql -At -U $eintrag.User -d $eintrag.Db -c $zaehlSql 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    $tabelle = @{}
    foreach ($z in @($zeilen)) {
        if (-not $z) { continue }
        $teile = $z -split '\|', 2
        if ($teile.Count -eq 2) { $tabelle[$teile[0]] = [int]$teile[1] }
    }
    return $tabelle
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "FEHLER: Docker ist nicht erreichbar (laeuft Docker Desktop?)." -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------- vorher
if ($Phase -eq "vorher") {
    $stempel = Get-Date -Format "yyyyMMdd_HHmmss"
    $ziel = Join-Path $zielRoot $stempel
    New-Item -ItemType Directory -Force $ziel | Out-Null
    $zaehlung = @{}
    $gesichert = 0

    foreach ($db in $datenbanken) {
        if (-not (Test-DienstLaeuft $db.Dienst)) {
            Write-Host ("  {0,-16} laeuft nicht - uebersprungen (Erstinstallation?)" -f $db.Dienst) -ForegroundColor Yellow
            continue
        }
        docker @compose exec -T $db.Dienst pg_dump -U $db.User -d $db.Db -F c -f /tmp/vor-update.dump
        if ($LASTEXITCODE -ne 0) {
            Write-Host ("FEHLER: pg_dump fuer {0} fehlgeschlagen." -f $db.Dienst) -ForegroundColor Red
            exit 1
        }
        $datei = Join-Path $ziel ($db.Dienst + ".dump")
        docker @compose cp ($db.Dienst + ":/tmp/vor-update.dump") $datei
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path $datei)) {
            Write-Host ("FEHLER: Sicherung fuer {0} konnte nicht kopiert werden." -f $db.Dienst) -ForegroundColor Red
            exit 1
        }
        $zahlen = Get-Zeilenzahlen $db
        if ($null -eq $zahlen) {
            Write-Host ("FEHLER: Zeilenzahlen fuer {0} konnten nicht ermittelt werden." -f $db.Dienst) -ForegroundColor Red
            exit 1
        }
        $zaehlung[$db.Dienst] = $zahlen
        $summe = ($zahlen.Values | Measure-Object -Sum).Sum
        $kb = [math]::Round((Get-Item $datei).Length / 1KB, 1)
        Write-Host ("  {0,-16} gesichert ({1} KB, {2} Tabellen, {3} Zeilen)" -f $db.Dienst, $kb, $zahlen.Count, $summe) -ForegroundColor Green
        $gesichert++
    }

    $zaehlung | ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 (Join-Path $ziel "zaehlung.json")
    Write-Host ("Sicherung vor Update: {0} Datenbank(en) -> {1}" -f $gesichert, $ziel)

    # Aufraeumen: nur die neuesten Update-Sicherungen behalten.
    $alt = Get-ChildItem -Path $zielRoot -Directory | Sort-Object Name -Descending | Select-Object -Skip $behalten
    foreach ($a in @($alt)) { Remove-Item -Recurse -Force $a.FullName }
    exit 0
}

# ---------------------------------------------------------------- nachher
$letzte = Get-ChildItem -Path $zielRoot -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
if (-not $letzte) {
    Write-Host "Plausibilitaetscheck: keine Sicherung vor dem Update gefunden - uebersprungen." -ForegroundColor Yellow
    exit 0
}
$json = $null
try {
    $json = Get-Content -Raw (Join-Path $letzte.FullName "zaehlung.json") -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
} catch { $json = $null }
if ($null -eq $json) {
    Write-Host ""
    Write-Host ("WARNUNG: Zaehlung aus {0} ist nicht lesbar - Plausibilitaetscheck NICHT moeglich." -f $letzte.FullName) -ForegroundColor Red
    Write-Host "Bitte die Datenbanken manuell pruefen, bevor jemand mit der Suite arbeitet." -ForegroundColor White
    exit 2
}
$warnungen = @()
$geprueft = 0

foreach ($db in $datenbanken) {
    $vorher = $json.PSObject.Properties[$db.Dienst]
    if (-not $vorher) { continue }   # lief vor dem Update nicht
    if (-not (Test-DienstLaeuft $db.Dienst)) {
        $warnungen += ("{0}: Datenbank laeuft nach dem Update NICHT." -f $db.Dienst)
        continue
    }
    # Kurz warten, falls die DB gerade erst hochkommt.
    $zahlen = $null
    for ($i = 0; $i -lt 10 -and $null -eq $zahlen; $i++) {
        $zahlen = Get-Zeilenzahlen $db
        if ($null -eq $zahlen) { Start-Sleep -Seconds 3 }
    }
    if ($null -eq $zahlen) {
        $warnungen += ("{0}: Zeilenzahlen nach dem Update nicht ermittelbar." -f $db.Dienst)
        continue
    }
    foreach ($p in $vorher.Value.PSObject.Properties) {
        $tab = $p.Name; $alt = [int]$p.Value
        if (-not $zahlen.ContainsKey($tab)) {
            $warnungen += ("{0}: Tabelle {1} fehlt nach dem Update (vorher {2} Zeilen)." -f $db.Dienst, $tab, $alt)
        } elseif ($zahlen[$tab] -lt $alt) {
            $warnungen += ("{0}: Tabelle {1} hat WENIGER Zeilen: vorher {2}, jetzt {3}." -f $db.Dienst, $tab, $alt, $zahlen[$tab])
        }
    }
    $geprueft++
}

if ($warnungen.Count -eq 0) {
    Write-Host ("Plausibilitaetscheck: {0} Datenbank(en) geprueft, keine Tabelle hat Zeilen verloren." -f $geprueft) -ForegroundColor Green
    exit 0
}

Write-Host ""
Write-Host "WARNUNG: Nach dem Update stimmen die Datenbanken nicht mit dem Stand davor ueberein!" -ForegroundColor Red
foreach ($w in $warnungen) { Write-Host "  - $w" -ForegroundColor Yellow }
Write-Host ""
Write-Host ("Sicherung von vor dem Update: {0}" -f $letzte.FullName) -ForegroundColor White
Write-Host "Bitte NICHT weiterarbeiten lassen, bevor die Ursache geklaert ist." -ForegroundColor White
exit 2

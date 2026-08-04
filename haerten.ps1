# OEHTB-Suite - Server-Haertung
#
# Setzt restriktive Dateirechte auf die .env (nur Administratoren, SYSTEM und
# das aktuelle Konto duerfen lesen) und prueft die Festplattenverschluesselung
# (BitLocker) sowie, dass die .env nicht versehentlich in Git liegt.
#
# Auf dem SERVER ausfuehren - am besten als Administrator (fuer die
# BitLocker-Abfrage). Kann jederzeit erneut laufen (idempotent).
#
# Aufruf:  per Doppelklick auf "SERVER - Haerten.bat"
#      oder: powershell -ExecutionPolicy Bypass -File .\haerten.ps1

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

function Titel($t) { Write-Host ""; Write-Host $t -ForegroundColor Cyan }
function Ok($t)    { Write-Host "  OK  $t" -ForegroundColor Green }
function Warn($t)  { Write-Host "  !!  $t" -ForegroundColor Yellow }

Write-Host "=== OEHTB-Suite: Server-Haertung ===" -ForegroundColor White

# Adminrechte? (nur ein Hinweis - das Skript laeuft trotzdem)
$istAdmin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $istAdmin) {
  Warn "Nicht als Administrator gestartet - die BitLocker-Abfrage kann eingeschraenkt sein."
  Warn "Fuer das vollstaendige Ergebnis: Rechtsklick -> 'Als Administrator ausfuehren'."
}

# ---------------------------------------------------------------------------
# 1) .env-Dateirechte verschaerfen
# ---------------------------------------------------------------------------
Titel "[1/3] Dateirechte der .env"
$envPfad = Join-Path $PSScriptRoot ".env"
if (Test-Path $envPfad) {
  # Aktuelles Konto per SID (funktioniert auch mit AzureAD-Konten).
  $meSid = ([System.Security.Principal.WindowsIdentity]::GetCurrent()).User.Value
  # /inheritance:r -> alle geerbten Rechte entfernen
  # /grant:r       -> gezielt Leserechte fuer Administratoren, SYSTEM, aktuelles Konto
  & icacls "$envPfad" /inheritance:r /grant:r "*S-1-5-32-544:R" "*S-1-5-18:R" "*$($meSid):R" | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Ok "Rechte gesetzt: nur Administratoren, SYSTEM und das aktuelle Konto duerfen lesen."
    Write-Host "  Aktuelle Rechte:"
    & icacls "$envPfad"
  } else {
    Warn "icacls meldete einen Fehler (Exit $LASTEXITCODE) - Rechte pruefen."
  }
} else {
  Warn "Keine .env gefunden. Zuerst 'SERVER - Einrichten.bat' ausfuehren."
}

# ---------------------------------------------------------------------------
# 2) BitLocker-Status des Systemlaufwerks
# ---------------------------------------------------------------------------
Titel "[2/3] Festplattenverschluesselung (BitLocker)"
$sys = $env:SystemDrive   # z. B. "C:"
$blOk = $false
try {
  $bl = Get-BitLockerVolume -MountPoint $sys -ErrorAction Stop
  Write-Host ("  Laufwerk {0}  Status: {1}  Schutz: {2}" -f $sys, $bl.VolumeStatus, $bl.ProtectionStatus)
  if ("$($bl.ProtectionStatus)" -eq "On") { $blOk = $true }
} catch {
  # Fallback, falls das BitLocker-PowerShell-Modul fehlt
  Write-Host "  (Get-BitLockerVolume nicht verfuegbar - nutze manage-bde)"
  & manage-bde -status $sys
  $roh = (& manage-bde -status $sys 2>$null | Out-String)
  if ($roh -match "Schutz(status)?\s*:\s*(Der Schutz ist aktiviert|Protection On)") { $blOk = $true }
}
if ($blOk) {
  Ok "Verschluesselung ist aktiv."
} else {
  Warn "BitLocker ist NICHT aktiv (oder nicht ermittelbar)."
  Warn "Empfehlung: aktivieren - siehe HAERTUNG.md, Abschnitt 1."
}

# ---------------------------------------------------------------------------
# 3) Kontrolle: .env nicht in Git versioniert
# ---------------------------------------------------------------------------
Titel "[3/3] Git-Kontrolle der .env"
try {
  $getrackt = (& git ls-files ".env" 2>$null)
  if ($getrackt) {
    Warn ".env ist in Git GETRACKT! Entfernen mit:  git rm --cached .env"
  } else {
    Ok ".env ist nicht in Git versioniert."
  }
} catch {
  Write-Host "  (git nicht verfuegbar - Kontrolle uebersprungen)"
}

Write-Host ""
Write-Host "Fertig. Manuelle Restschritte und Erklaerungen: HAERTUNG.md" -ForegroundColor White

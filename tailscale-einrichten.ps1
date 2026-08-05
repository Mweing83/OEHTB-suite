# OEHTB-Suite - Tailscale-HTTPS einrichten (weitgehend automatisch)
#
# Bringt den Server ins Tailnet und veroeffentlicht die Suite verschluesselt
# unter  https://<name>.<tailnet>.ts.net . Idempotent (mehrfach ausfuehrbar).
#
# EINMALIG MANUELL (in der Tailscale-Admin-Konsole, https://login.tailscale.com):
#   1) Auth-Key erzeugen -> in .env eintragen:  TAILSCALE_AUTHKEY=tskey-...
#   2) HTTPS-Zertifikate / MagicDNS im Tailnet aktivieren (DNS-Seite).
# Der Server braucht Internet (Tailscale-Koordination + Zertifikate).
#
# Aufruf:  per "SERVER - Tailscale.bat" (als Administrator)
#      oder: powershell -ExecutionPolicy Bypass -File .\tailscale-einrichten.ps1

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

function Titel($t) { Write-Host ""; Write-Host $t -ForegroundColor Cyan }
function Ok($t)    { Write-Host "  OK  $t" -ForegroundColor Green }
function Warn($t)  { Write-Host "  !!  $t" -ForegroundColor Yellow }
function Fehler($t){ Write-Host "  XX  $t" -ForegroundColor Red }

Write-Host "=== OEHTB-Suite: Tailscale-HTTPS einrichten ===" -ForegroundColor White

# ---------------------------------------------------------------------------
# .env lesen (TAILSCALE_AUTHKEY, optional TAILSCALE_HOSTNAME)
# ---------------------------------------------------------------------------
$envPfad = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $envPfad)) {
  Fehler ".env fehlt - zuerst 'SERVER - Einrichten.bat' ausfuehren."
  exit 1
}
function EnvWert([string]$name) {
  $muster = "^{0}=" -f [regex]::Escape($name)
  $treffer = Select-String -Path $envPfad -Pattern $muster -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($treffer) { return ($treffer.Line -replace $muster, "").Trim() }
  return $null
}
$authkey  = EnvWert "TAILSCALE_AUTHKEY"
$hostname = EnvWert "TAILSCALE_HOSTNAME"
if ([string]::IsNullOrWhiteSpace($hostname)) { $hostname = "oehtb-suite" }

# ---------------------------------------------------------------------------
# 1) Tailscale finden / bei Bedarf installieren
# ---------------------------------------------------------------------------
Titel "[1/4] Tailscale vorhanden?"
$ts = "C:\Program Files\Tailscale\tailscale.exe"
if (-not (Test-Path $ts)) {
  Warn "Tailscale nicht gefunden - versuche automatische Installation..."
  $installiert = $false
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host "  winget: installiere Tailscale.Tailscale ..."
    try {
      & winget install --id Tailscale.Tailscale --silent --accept-package-agreements --accept-source-agreements
    } catch { }
    if (Test-Path $ts) { $installiert = $true }
  }
  if (-not $installiert) {
    Warn "winget nicht verfuegbar/erfolglos - lade MSI von tailscale.com ..."
    $msi = Join-Path $env:TEMP "tailscale-setup.msi"
    try {
      Invoke-WebRequest -Uri "https://pkgs.tailscale.com/stable/tailscale-setup-latest.msi" -OutFile $msi -UseBasicParsing
      Start-Process msiexec.exe -ArgumentList "/i", "`"$msi`"", "/quiet", "/norestart" -Wait
      if (Test-Path $ts) { $installiert = $true }
    } catch {
      Fehler ("MSI-Installation fehlgeschlagen: {0}" -f $_.Exception.Message)
    }
  }
  if (-not (Test-Path $ts)) {
    Fehler "Tailscale konnte nicht installiert werden."
    Warn "Bitte manuell installieren: https://tailscale.com/download/windows - danach dieses Skript erneut ausfuehren."
    exit 1
  }
}
Ok ("Tailscale gefunden: {0}" -f $ts)

# ---------------------------------------------------------------------------
# 2) Beitritt zum Tailnet (unbeaufsichtigt per Auth-Key)
# ---------------------------------------------------------------------------
Titel "[2/4] Beitritt zum Tailnet"
$backend = ""
try {
  $j = (& $ts status --json 2>$null | ConvertFrom-Json)
  if ($j) { $backend = "$($j.BackendState)" }
} catch { }

if ($backend -eq "Running") {
  Ok "Server ist bereits im Tailnet angemeldet - ueberspringe Login."
} elseif (-not [string]::IsNullOrWhiteSpace($authkey)) {
  Write-Host "  Melde den Server unbeaufsichtigt an (Auth-Key aus .env)..."
  & $ts up --authkey "$authkey" --hostname "$hostname" --accept-dns=false
  if ($LASTEXITCODE -ne 0) {
    Fehler "tailscale up fehlgeschlagen. Ist der Auth-Key gueltig und nicht abgelaufen?"
    exit 1
  }
  Ok "Angemeldet."
} else {
  Warn "Kein TAILSCALE_AUTHKEY in der .env und der Server ist nicht angemeldet."
  Warn "Erzeuge einen Auth-Key in der Admin-Konsole und trage ihn in die .env ein:"
  Warn "  TAILSCALE_AUTHKEY=tskey-...."
  Warn ("Alternativ einmalig interaktiv anmelden:  `"{0}`" up" -f $ts)
  exit 1
}

# ---------------------------------------------------------------------------
# 3) HTTPS-Weiterleitung auf die Suite (nginx, Port 80) - dauerhaft
# ---------------------------------------------------------------------------
Titel "[3/4] HTTPS-Weiterleitung auf die Suite (Port 80)"
$serveOk = $false
# Neuere Tailscale-Syntax zuerst, dann die aeltere als Fallback.
& $ts serve --bg http://localhost:80 2>$null
if ($LASTEXITCODE -eq 0) { $serveOk = $true }
if (-not $serveOk) {
  & $ts serve --bg https / http://localhost:80 2>$null
  if ($LASTEXITCODE -eq 0) { $serveOk = $true }
}
if ($serveOk) {
  Ok "HTTPS-Weiterleitung aktiv (bleibt ueber Neustarts erhalten)."
} else {
  Fehler "tailscale serve fehlgeschlagen."
  Warn "Haeufigste Ursache: HTTPS-Zertifikate im Tailnet nicht aktiviert."
  Warn "Admin-Konsole -> DNS -> 'HTTPS Certificates' (MagicDNS) aktivieren, dann erneut ausfuehren."
  Warn ("Aktuelle serve-Konfiguration pruefen:  `"{0}`" serve status" -f $ts)
  exit 1
}

# ---------------------------------------------------------------------------
# 4) Ergebnis + Sicherheits-Hinweis (Cookies)
# ---------------------------------------------------------------------------
Titel "[4/4] Ergebnis"
$url = "https://<name>.<tailnet>.ts.net"
try {
  $dns = (& $ts status --json 2>$null | ConvertFrom-Json).Self.DNSName
  if ($dns) { $url = "https://" + $dns.TrimEnd('.') }
} catch { }
Ok ("Suite erreichbar unter:  {0}" -f $url)
Write-Host "  (Clients muessen im selben Tailnet angemeldet sein.)"

Write-Host ""
Write-Host "WICHTIG - Session-Cookies auf 'secure' umstellen (einmalig):" -ForegroundColor White
Write-Host "  1) In der .env die Zeile 'COOKIE_INSECURE=1' entfernen oder auskommentieren."
Write-Host "  2) Suite neu starten:  ""SERVER - Starten.bat""  (oder: docker compose --profile produktion up -d)"
Write-Host "  -> Danach laeuft der Zugriff verschluesselt und die Cookies sind an HTTPS gebunden."
Write-Host ""
Write-Host "Details: TAILSCALE.md" -ForegroundColor White

#Requires -Version 5.1
<#
============================================================
  OEHTB Handkassen - Gefuehrte Einrichtung (Produktivbetrieb)
  Zielumgebung: Windows Server + Docker + Tailscale (HTTPS)
------------------------------------------------------------
  Dieses Skript automatisiert die Routinearbeit und fragt an
  den wichtigen/heiklen Stellen nach. Es trifft KEINE
  sicherheitsrelevanten Entscheidungen im Hintergrund:
    - Geheimnisse werden erzeugt, aber nichts wird ohne
      Rueckfrage ueberschrieben.
    - Demo-Zugaenge werden NICHT geloescht (manuell in der App).
    - Tailscale-Anmeldung erfolgt interaktiv durch die IT.

  Aufruf (in einer PowerShell ALS ADMINISTRATOR):
    powershell -ExecutionPolicy Bypass -File .\setup-server.ps1

  Optional:
    -Unattended   beantwortet Rueckfragen automatisch mit "Ja"
                  (nur fuer wiederholte, gepruefte Laeufe gedacht)
============================================================
#>

param([switch]$Unattended)

Set-Location -Path $PSScriptRoot
$ErrorActionPreference = "Stop"

# ---------------- Hilfsfunktionen ----------------
function Schritt($t) { Write-Host ""; Write-Host "==> $t" -ForegroundColor Cyan }
function Info($t)     { Write-Host "    $t" }
function Ok($t)       { Write-Host "    $t" -ForegroundColor Green }
function Warnung($t)  { Write-Host "    $t" -ForegroundColor Yellow }
function Fehler($t)   { Write-Host ""; Write-Host "FEHLER: $t" -ForegroundColor Red; exit 1 }

function Frage($t) {
    if ($Unattended) { return $true }
    $a = Read-Host "    $t [j/N]"
    return ($a -match '^[jJyY]')
}

function Hat-Befehl($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Neu-Geheimnis([int]$bytes = 48) {
    $b = New-Object 'System.Byte[]' $bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    return (-join ($b | ForEach-Object { $_.ToString('x2') }))
}

function Get-EnvVar($pfad, $name) {
    if (-not (Test-Path $pfad)) { return $null }
    $m = Select-String -Path $pfad -Pattern "^\s*$([regex]::Escape($name))=(.*)$"
    if ($m) { return $m.Matches[0].Groups[1].Value } else { return $null }
}

function Set-EnvVar($pfad, $name, $wert) {
    $zeilen = @()
    if (Test-Path $pfad) { $zeilen = @(Get-Content $pfad) }
    $gefunden = $false
    $neu = foreach ($z in $zeilen) {
        if ($z -match "^\s*$([regex]::Escape($name))=") { $gefunden = $true; "$name=$wert" }
        else { $z }
    }
    if (-not $gefunden) { $neu = @($neu) + "$name=$wert" }
    Set-Content -Path $pfad -Value $neu -Encoding UTF8
}

function Winget-Install($id, $anzeige) {
    if (-not (Hat-Befehl winget)) {
        Warnung "winget ist nicht verfuegbar - '$anzeige' bitte manuell installieren."
        return $false
    }
    if (Frage "'$anzeige' jetzt per winget installieren?") {
        winget install --id $id -e --accept-source-agreements --accept-package-agreements
        return ($LASTEXITCODE -eq 0)
    }
    return $false
}

# ---------------- Start ----------------
Write-Host "============================================================" -ForegroundColor White
Write-Host "  OEHTB Handkassen - Gefuehrte Einrichtung (Produktivbetrieb)" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor White
Info "Projektordner: $PSScriptRoot"

# 0) Administratorrechte
$istAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $istAdmin) {
    Warnung "Dieses Fenster hat KEINE Administratorrechte."
    Warnung "Fuer das Installieren von Tools (Docker/Tailscale) bitte PowerShell als Administrator starten."
    if (-not (Frage "Trotzdem fortfahren (z. B. wenn Tools bereits installiert sind)?")) { exit 0 }
}

# 1) Grunddateien vorhanden?
Schritt "Pruefe Projektdateien..."
foreach ($datei in @(".\docker-compose.yml", ".\.env.example", ".\backend\Dockerfile")) {
    if (-not (Test-Path $datei)) { Fehler "Datei fehlt: $datei. Wird das Skript aus dem Projektordner ausgefuehrt?" }
}
Ok "Projektdateien gefunden."

# 2) Docker
Schritt "Pruefe Docker..."
if (-not (Hat-Befehl docker)) {
    Warnung "Docker ist nicht installiert."
    Winget-Install "Docker.DockerDesktop" "Docker Desktop" | Out-Null
    Warnung "Nach der Docker-Installation ist meist ein Neustart/Abmelden noetig."
    Warnung "Bitte Docker abschliessen, sicherstellen dass es laeuft, und dieses Skript erneut starten."
    if (-not (Hat-Befehl docker)) { Fehler "Docker steht noch nicht bereit." }
}
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Warnung "Docker ist installiert, laeuft aber nicht. Versuche, Docker Desktop zu starten..."
    $dockerPfad = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerPfad) {
        Start-Process $dockerPfad
        Info "Warte, bis Docker bereit ist (kann 1-2 Minuten dauern)..."
        $n = 0
        do {
            Start-Sleep -Seconds 5
            docker info *> $null
            $n++
            if ($n -gt 36) { Fehler "Docker ist nicht rechtzeitig gestartet. Bitte manuell starten und erneut versuchen." }
        } while ($LASTEXITCODE -ne 0)
    } else {
        Fehler "Docker laeuft nicht und wurde nicht gefunden. Bitte Docker starten und erneut versuchen."
    }
}
Ok "Docker laeuft."

# 3) Konfiguration / Geheimnisse (Datei .env im Projektordner)
Schritt "Konfiguration und Geheimnisse (.env)"
if (-not (Test-Path ".\.env")) {
    Copy-Item ".\.env.example" ".\.env"
    Ok ".env aus Vorlage erstellt."
} else {
    Info ".env ist bereits vorhanden."
}

# JWT_SECRET: erzeugen, wenn fehlend/Platzhalter/zu kurz
$jwt = Get-EnvVar ".\.env" "JWT_SECRET"
if ([string]::IsNullOrWhiteSpace($jwt) -or ($jwt -like "*bitte*") -or ($jwt.Length -lt 32)) {
    Set-EnvVar ".\.env" "JWT_SECRET" (Neu-Geheimnis 48)
    Ok "JWT_SECRET neu erzeugt (langer Zufallswert)."
} else {
    Info "JWT_SECRET ist bereits gesetzt - bleibt unveraendert."
}

# POSTGRES_PASSWORD: nur anfassen, wenn noch Standard/leer.
# WICHTIG: muss VOR dem ersten Datenbankstart gesetzt sein (danach ist das
# Datenbank-Volume initialisiert und das Passwort laesst sich so nicht mehr aendern).
$pw = Get-EnvVar ".\.env" "POSTGRES_PASSWORD"
$dbVolumeDa = $false
docker volume inspect handkassen_db_data *> $null
if ($LASTEXITCODE -eq 0) { $dbVolumeDa = $true }

if ([string]::IsNullOrWhiteSpace($pw) -or $pw -eq "handkassen") {
    if ($dbVolumeDa) {
        Warnung "Es existiert bereits eine Datenbank, aber das Passwort steht noch auf dem Standard."
        Warnung "Ein nachtraegliches Aendern wirkt NICHT auf eine schon initialisierte Datenbank."
        Warnung "Auf einem frischen Server ist das normalerweise kein Thema."
    }
    if (Frage "Sicheres Datenbank-Passwort jetzt setzen?") {
        if (Frage "  Automatisch erzeugen? (Nein = selbst eingeben)") {
            $pw = Neu-Geheimnis 18
            Ok "Datenbank-Passwort automatisch erzeugt (in .env gespeichert)."
        } else {
            $pwSec = Read-Host "  Neues Datenbank-Passwort" -AsSecureString
            $pw = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($pwSec))
        }
        Set-EnvVar ".\.env" "POSTGRES_PASSWORD" $pw
    } else {
        Warnung "Datenbank-Passwort bleibt auf dem Standard - VOR echtem Betrieb aendern!"
    }
} else {
    Info "POSTGRES_PASSWORD wurde bereits angepasst - bleibt unveraendert."
}

# Optional: NAS/USB-Sicherungspfade
Schritt "Sicherungs-Ablageorte (optional)"
Info "Standard sind Ordner im Projekt (.\backups, .\backups-nas, .\backups-usb)."
if (Frage "NAS-Sicherungsziel jetzt einrichten?") {
    if (Frage "Benoetigt die NAS-Freigabe Benutzername und Passwort?") {
        $nasFreigabe = Read-Host "    NAS-Freigabe (z. B. \\\\nas-server\\sicherung)"
        $nasUser     = Read-Host "    NAS-Benutzername"
        $nasPwSec    = Read-Host "    NAS-Passwort" -AsSecureString
        $nasPw       = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
                           [Runtime.InteropServices.Marshal]::SecureStringToBSTR($nasPwSec))

        # Zugangsdaten dauerhaft im Windows-Anmeldedaten-Manager speichern
        cmdkey /add:$nasFreigabe /user:$nasUser /pass:$nasPw | Out-Null
        Ok "Zugangsdaten im Anmeldedaten-Manager gespeichert."

        # Laufwerksbuchstabe bestimmen
        $bst = Read-Host "    Laufwerksbuchstabe fuer die Netzwerk-Freigabe (z. B. Z)"
        $bst = $bst.Trim().TrimEnd(':').ToUpper()
        $laufwerk = "${bst}:"

        # Vorhandenes Mapping entfernen, dann neu anlegen (/persistent:yes)
        net use $laufwerk /delete 2>$null | Out-Null
        $netUseAusgabe = net use $laufwerk $nasFreigabe /user:$nasUser $nasPw /persistent:yes 2>&1
        if ($LASTEXITCODE -eq 0) {
            Ok "Laufwerk $laufwerk -> $nasFreigabe erfolgreich gemappt."
        } else {
            Warnung "Laufwerk konnte nicht automatisch gemappt werden: $netUseAusgabe"
            Warnung "Bitte manuell pruefen:  net use $laufwerk $nasFreigabe /user:$nasUser /persistent:yes"
        }

        # Unterordner anlegen
        $nasZiel = "${laufwerk}\handkassen-backup"
        New-Item -ItemType Directory -Force -Path $nasZiel -ErrorAction SilentlyContinue | Out-Null

        Set-EnvVar ".\.env" "BACKUP_NAS" $nasZiel
        Ok "BACKUP_NAS auf $nasZiel gesetzt."

        Warnung "Docker Desktop: Laufwerk $laufwerk unter Settings -> Resources -> File sharing freigeben"
        Warnung "und dann 'Apply & Restart'. Sonst kann der Container nicht darauf schreiben."
        Warnung "Hinweis: Das Mapping gilt fuer den aktuellen Benutzer. Laeuft Docker als"
        Warnung "Windows-Dienst (SYSTEM), bitte einen Aufgabenplaner-Task einrichten."
        Warnung "Details: INSTALL-Windows-Server.md, Abschnitt 7.1."
    } else {
        $nas = Read-Host "    NAS-Pfad (z. B. Z:\handkassen-backup)"
        if (-not [string]::IsNullOrWhiteSpace($nas)) { Set-EnvVar ".\.env" "BACKUP_NAS" $nas; Ok "BACKUP_NAS gesetzt." }
    }
} else {
    Info "NAS uebersprungen - kann spaeter in .env oder in der App eingetragen werden."
}

if (Frage "USB-Sicherungsziel jetzt eintragen?") {
    $usb = Read-Host "    USB-Pfad (leer lassen zum Ueberspringen)"
    if (-not [string]::IsNullOrWhiteSpace($usb)) { Set-EnvVar ".\.env" "BACKUP_USB" $usb; Ok "BACKUP_USB gesetzt." }
} else {
    Info "USB uebersprungen - kann spaeter in .env oder in der App eingetragen werden."
}

# 4) Bauen und starten
Schritt "Anwendung bauen und starten"
Info "Beim ersten Mal werden Frontend und Backend gebaut - das dauert einige Minuten."
if (Frage "Jetzt bauen und starten (docker compose --profile produktion up -d --build)?") {
    docker compose --profile produktion up -d --build
    if ($LASTEXITCODE -ne 0) { Fehler "Bauen/Starten fehlgeschlagen. Bitte die Ausgabe oben pruefen." }
    Ok "Container gestartet."
} else {
    Warnung "Uebersprungen. Spaeter manuell: docker compose --profile produktion up -d --build"
}

# 5) Health-Check
Schritt "Warte auf die Anwendung..."
$bereit = $false
for ($i = 0; $i -lt 40; $i++) {
    try {
        $r = Invoke-WebRequest "http://localhost:3001/api/health" -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) { $bereit = $true; break }
    } catch { }
    Start-Sleep -Seconds 3
}
if ($bereit) {
    Ok "Anwendung antwortet: http://localhost:3001"
} else {
    Warnung "Noch keine Antwort von der Anwendung."
    Info "Logs ansehen mit:  docker compose --profile produktion logs -f app"
}

# 6) Tailscale / HTTPS
Schritt "HTTPS ueber Tailscale"
if (-not (Hat-Befehl tailscale)) {
    Warnung "Tailscale ist nicht installiert."
    Winget-Install "tailscale.tailscale" "Tailscale" | Out-Null
}
if (Hat-Befehl tailscale) {
    $tsStatus = (& tailscale status) 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($tsStatus)) {
        Warnung "Tailscale ist installiert, aber noch nicht angemeldet."
        Info "Einmalig anmelden (interaktiv):   tailscale up"
        Info "In der Tailscale-Admin-Konsole 'HTTPS Certificates' / MagicDNS aktivieren."
        Info "Danach die App ueber HTTPS bereitstellen:"
        Info "    tailscale serve --bg https / http://localhost:3001"
    } else {
        Ok "Tailscale ist aktiv."
        Info "Empfohlener Befehl zum Bereitstellen ueber HTTPS:"
        Info "    tailscale serve --bg https / http://localhost:3001"
        if (Frage "Diesen Befehl jetzt ausfuehren?") {
            try {
                & tailscale serve --bg https / http://localhost:3001
                Ok "Tailscale serve eingerichtet."
                & tailscale serve status
            } catch {
                Warnung "Konnte 'tailscale serve' nicht automatisch setzen (Syntax variiert je nach Version)."
                Info "Bitte manuell pruefen mit:  tailscale serve --help"
            }
        }
    }
} else {
    Warnung "Tailscale nicht verfuegbar - bitte manuell installieren und einrichten."
}

# 7) Abschluss / manuelle Pflichtschritte
Schritt "Fertig - jetzt noch diese manuellen Schritte (WICHTIG):"
Write-Host @"
    1) App im Browser oeffnen - ueber die HTTPS-Adresse des Servers im Tailnet,
       z. B.  https://<servername>.<dein-tailnet>.ts.net
       (Im LAN zum Testen: http://localhost:3001)

    2) Als  admin / admin123  anmelden und SOFORT:
         - eigenes Passwort aendern (oben rechts "Passwort aendern"),
         - echte Benutzer anlegen (Verwaltung -> Benutzer),
         - die Demo-Zugaenge admin/leitung/erfasser deaktivieren.

    3) Verwaltung -> System -> Datensicherung:
         - Zeitplan/Aufbewahrung pruefen,
         - NAS-/USB-Ziele aktivieren (Ablageorte stehen in .env, danach Container
           neu starten: docker compose --profile produktion up -d).
         - NAS mit Zugangsdaten: siehe INSTALL-Windows-Server.md Abschnitt 7.1.

    4) Autostart sicherstellen: Die Container starten dank "restart: unless-stopped"
       von selbst neu - ABER nur, wenn Docker laeuft. Auf Windows Server ist Docker
       Desktop an eine Anmeldung gebunden. Hinweise dazu in INSTALL-Windows-Server.md.
"@ -ForegroundColor Gray

Write-Host ""
Ok "Einrichtung abgeschlossen."
Write-Host ""

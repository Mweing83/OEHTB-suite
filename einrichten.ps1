# OEHTB-Suite - Ersteinrichtung: erzeugt eine .env mit STARKEN Zufalls-Secrets.
#
# Ausfuehren beim Aufsetzen auf einem neuen Server (einmalig):
#   powershell -ExecutionPolicy Bypass -File .\einrichten.ps1
# oder per Doppelklick auf "SERVER - Einrichten.bat".
#
# Erzeugt: JWT_SECRET, PROVISION_SECRET, alle DB-Passwoerter und die beiden
# ENCRYPTION_KEYs (je genau 32 Zeichen). Alle Werte sind zufaellig und
# URL-sicher (nur A-Z a-z 0-9), damit sie problemlos in den DATABASE_URLs
# stehen koennen.
#
# Sicherheitsnetz: Eine BESTEHENDE .env wird NIE ueberschrieben (sonst gingen
# Passwoerter laufender Datenbanken verloren). Zum Neu-Erzeugen die alte .env
# vorher bewusst umbenennen/loeschen.

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$envPfad = Join-Path $PSScriptRoot ".env"
if (Test-Path $envPfad) {
    Write-Host "FEHLER: .env existiert bereits - wird NICHT ueberschrieben." -ForegroundColor Red
    Write-Host "Die vorhandenen Passwoerter gehoeren zu den bestehenden Datenbanken."
    Write-Host "Zum Neu-Erzeugen die alte .env zuerst bewusst umbenennen oder loeschen."
    exit 1
}

# Kryptografisch sichere Zufallszeichen aus einer Zeichenmenge erzeugen.
function Neue-Zeichen([int]$laenge, [string]$zeichen) {
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $bytes = New-Object 'byte[]' $laenge
        $rng.GetBytes($bytes)
        $sb = New-Object System.Text.StringBuilder
        foreach ($b in $bytes) {
            [void]$sb.Append($zeichen[$b % $zeichen.Length])
        }
        return $sb.ToString()
    } finally {
        $rng.Dispose()
    }
}

# URL-sichere Zeichenmenge (keine Sonderzeichen, die eine DATABASE_URL zerlegen).
$alnum = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

$jwt          = Neue-Zeichen 64 $alnum   # 64 Zeichen, deutlich ueber dem 32-Minimum
$provision    = Neue-Zeichen 40 $alnum   # 40 Zeichen, ueber dem 16-Minimum
$suitePw      = Neue-Zeichen 32 $alnum
$hkPw         = Neue-Zeichen 32 $alnum
$stundenPw    = Neue-Zeichen 32 $alnum
$foerderPw    = Neue-Zeichen 32 $alnum
$stundenKey   = Neue-Zeichen 32 $alnum   # ENCRYPTION_KEY: genau 32 Zeichen
$foerderKey   = Neue-Zeichen 32 $alnum   # ENCRYPTION_KEY: genau 32 Zeichen

$inhalt = @"
# OEHTB-Suite - Produktions-Konfiguration (automatisch erzeugt von einrichten.ps1)
# ACHTUNG: Diese Datei enthaelt Geheimnisse. Nicht ins Git, nicht weitergeben.

# ==== SSO (gemeinsam fuer Portal + ALLE Tools) ====
JWT_SECRET=$jwt

# ==== User-Provisionierung (Suite -> Tools, internes Docker-Netz) ====
PROVISION_SECRET=$provision

# ==== Transport / Cookies ====
# Zugriff erfolgt ueber Tailscale-HTTPS (TLS terminiert vor nginx). Cookies
# werden mit secure-Flag gesetzt; COOKIE_INSECURE bleibt daher LEER.
# Nur fuer reinen HTTP-Betrieb im abgeschotteten LAN auf 1 setzen.
# COOKIE_INSECURE=
SESSION_TIMEOUT_MINUTEN=15

# ==== Tailscale (optionaler HTTPS-Fernzugriff) ====
# Auth-Key EINMALIG in der Tailscale-Admin-Konsole erzeugen und hier eintragen,
# dann "SERVER - Tailscale.bat" ausfuehren. Geheim halten. Details: TAILSCALE.md
# TAILSCALE_AUTHKEY=tskey-...
# TAILSCALE_HOSTNAME=oehtb-suite

# ==== Datenbanken ====
SUITE_DB_USER=suite
SUITE_DB_PASSWORD=$suitePw
SUITE_DB_NAME=suite

HK_DB_USER=handkassen
HK_DB_PASSWORD=$hkPw
HK_DB_NAME=handkassen

STUNDEN_DB_USER=stunden
STUNDEN_DB_PASSWORD=$stundenPw
STUNDEN_DB_NAME=stunden

# Verschluesselung der im Stunden-Tool gespeicherten API-Keys (genau 32 Zeichen).
STUNDEN_ENCRYPTION_KEY=$stundenKey

FOERDERUNGEN_DB_USER=foerderungen
FOERDERUNGEN_DB_PASSWORD=$foerderPw
FOERDERUNGEN_DB_NAME=foerderungen

# Verschluesselung der im Foerderungen-Tool gespeicherten API-Keys (genau 32 Zeichen).
FOERDERUNGEN_ENCRYPTION_KEY=$foerderKey

# ==== Handkassen-Backup-Ablageorte (echte Server-Pfade eintragen) ====
BACKUP_LOKAL=./handkassen/backups
BACKUP_NAS=./handkassen/backups-nas
BACKUP_USB=./handkassen/backups-usb
"@

# Ohne BOM schreiben, damit die erste Variable sauber gelesen wird.
[System.IO.File]::WriteAllText($envPfad, $inhalt, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ".env wurde mit starken Zufalls-Secrets erzeugt." -ForegroundColor Green
Write-Host ""
Write-Host "WICHTIG:"
Write-Host "  - Diese .env sichern (Passwort-Manager): Bei Verlust sind die"
Write-Host "    verschluesselten API-Keys nicht mehr lesbar."
Write-Host "  - Uebernimmst du eine BESTEHENDE Handkassen-Datenbank, muessen"
Write-Host "    HK_DB_USER/HK_DB_PASSWORD/HK_DB_NAME zu deren urspruenglichen"
Write-Host "    Werten passen - dann diese drei Zeilen entsprechend anpassen."
Write-Host ""
Write-Host "Naechster Schritt:  SERVER - Starten.bat  (oder: docker compose --profile produktion up -d --build)"

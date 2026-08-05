@echo off
REM ============================================================
REM   OEHTB-Suite (Produktivbetrieb) - Tailscale-HTTPS einrichten
REM   Bringt den Server ins Tailnet und veroeffentlicht die Suite
REM   verschluesselt unter https://<name>.<tailnet>.ts.net.
REM   Voraussetzung: TAILSCALE_AUTHKEY in der .env (einmalig aus
REM   der Tailscale-Admin-Konsole). Details: TAILSCALE.md
REM   Als Administrator ausfuehren (Installation + Dienst).
REM ============================================================
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File ".\tailscale-einrichten.ps1"
if errorlevel 1 (
  echo.
  echo Tailscale-Einrichtung mit Fehler beendet - Ausgabe oben pruefen ^(siehe TAILSCALE.md^).
  pause
  exit /b 1
)

echo.
echo Fertig. Cookie-Umstellung und Details: TAILSCALE.md
pause

@echo off
REM ============================================================
REM   OEHTB-Suite (Produktivbetrieb) - Server haerten
REM   Setzt restriktive Dateirechte auf die .env, prueft die
REM   Festplattenverschluesselung (BitLocker) und dass die .env
REM   nicht in Git liegt. Aendert KEINE Daten und keine Secrets.
REM   Am besten als Administrator ausfuehren.
REM ============================================================
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File ".\haerten.ps1"
if errorlevel 1 (
  echo.
  echo Haertung mit Fehler beendet - Ausgabe oben pruefen.
  pause
  exit /b 1
)

echo.
echo Fertig. Weitere manuelle Schritte stehen in HAERTUNG.md
pause

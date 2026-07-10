@echo off
REM ============================================================
REM   OEHTB Handkassen (Produktivbetrieb) - Aktualisieren
REM   Holt die neue Version (git pull) und baut die Container neu.
REM   NUR ausfuehren, wenn eine neue Version eingespielt werden soll.
REM ============================================================
cd /d "%~dp0"
echo Hole neue Version (git pull)...
echo.
git pull
if errorlevel 1 (
  echo.
  echo FEHLER beim "git pull". Es wurde NICHT neu gebaut.
  echo Bitte die Meldung oben pruefen.
  echo.
  pause
  exit /b 1
)
echo.
echo Baue und starte neu - das kann beim ersten Mal einige Minuten dauern...
echo.
docker compose --profile produktion up -d --build
echo.
echo Aktueller Status:
docker compose --profile produktion ps
echo.
echo Fertig.
echo.
pause

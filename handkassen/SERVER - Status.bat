@echo off
REM ============================================================
REM   OEHTB Handkassen (Produktivbetrieb) - Status & Logs
REM   Zeigt, ob alles laeuft, und die letzten App-Meldungen.
REM   Hilfreich zur Fehlersuche.
REM ============================================================
cd /d "%~dp0"
echo === Container-Status ===
docker compose --profile produktion ps
echo.
echo === Letzte App-Meldungen (50 Zeilen) ===
docker compose --profile produktion logs --tail 50 app
echo.
echo (Fenster offen lassen oder schliessen - dies aendert nichts am Betrieb.)
echo.
pause

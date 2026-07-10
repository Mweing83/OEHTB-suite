@echo off
REM ============================================================
REM   OEHTB Handkassen (Produktivbetrieb) - Neu starten
REM   Startet die laufenden Container durch (ohne Neu-Bauen).
REM   Fuer den Fall, dass etwas hakt. Daten bleiben erhalten.
REM ============================================================
cd /d "%~dp0"
echo Starte Handkassen neu...
echo.
docker compose --profile produktion restart
echo.
echo Aktueller Status:
docker compose --profile produktion ps
echo.
pause

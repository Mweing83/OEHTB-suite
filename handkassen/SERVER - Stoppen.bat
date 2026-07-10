@echo off
REM ============================================================
REM   OEHTB Handkassen (Produktivbetrieb) - Stoppen
REM   Stoppt die Container. ALLE DATEN BLEIBEN ERHALTEN
REM   (Datenbank und Belege liegen in Docker-Volumes).
REM ============================================================
cd /d "%~dp0"
echo Stoppe Handkassen (Produktivbetrieb)...
echo.
docker compose --profile produktion down
echo.
echo Gestoppt. Die Daten bleiben erhalten (es wurden KEINE Volumes geloescht).
echo Zum Wiederstarten: "SERVER - Starten.bat" doppelklicken.
echo.
pause

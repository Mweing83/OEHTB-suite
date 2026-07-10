@echo off
REM ============================================================
REM   OEHTB Handkassen (Produktivbetrieb) - Starten
REM   Startet Datenbank, App und Backup als Docker-Container.
REM   Laufendes bleibt unberuehrt. Voraussetzung: Docker laeuft.
REM ============================================================
cd /d "%~dp0"
echo Starte Handkassen (Produktivbetrieb)...
echo.
docker compose --profile produktion up -d
echo.
echo Aktueller Status:
docker compose --profile produktion ps
echo.
echo Fertig. Erreichbar im LAN unter:  http://%COMPUTERNAME%:3001
echo (alternativ ueber die IP-Adresse des Servers, z. B. http://192.168.x.x:3001)
echo.
pause

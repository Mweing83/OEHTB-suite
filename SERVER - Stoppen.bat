@echo off
REM OEHTB-Suite stoppen (Daten/Volumes bleiben erhalten).
cd /d "%~dp0"
echo Stoppe alle Suite-Dienste ...
docker compose --profile produktion down
echo Fertig. Die Datenbanken/Volumes bleiben erhalten.
pause

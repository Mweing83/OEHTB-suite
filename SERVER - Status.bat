@echo off
REM Status der Suite-Dienste anzeigen.
cd /d "%~dp0"
docker compose --profile produktion ps
echo.
pause

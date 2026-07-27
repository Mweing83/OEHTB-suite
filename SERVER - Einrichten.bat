@echo off
REM OEHTB-Suite: Ersteinrichtung - erzeugt .env mit starken Zufalls-Secrets.
cd /d "%~dp0"

if exist ".env" (
  echo Es existiert bereits eine .env - sie wird NICHT ueberschrieben.
  echo Zum Neu-Erzeugen die alte .env zuerst bewusst umbenennen oder loeschen.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File ".\einrichten.ps1"
if errorlevel 1 (
  echo Einrichtung fehlgeschlagen.
  pause
  exit /b 1
)

echo.
echo Fertig. Weiter mit "SERVER - Starten.bat".
pause

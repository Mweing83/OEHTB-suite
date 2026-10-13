@echo off
REM OEHTB-Suite starten (Produktivbetrieb: Portal + Handkassen + Stunden + nginx).
cd /d "%~dp0"

if not exist ".env" (
  echo FEHLER: .env fehlt. Bitte ".env.example" nach ".env" kopieren und Werte setzen.
  pause
  exit /b 1
)

REM Schutz: haengt ein fremder Container (nicht Projekt oehtb-suite) an Suite-Volumes?
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\volume-schutz.ps1"
if errorlevel 1 (
  pause
  exit /b 1
)

REM Beleg-Volume ist in docker-compose.yml "external" (stammt aus der Standalone-Zeit);
REM hier sicherstellen, dass es existiert (idempotent, loescht nichts).
docker volume create handkassen_belege_data >nul 2>nul

echo Baue und starte alle Dienste ...
docker compose --profile produktion up -d --build
if errorlevel 1 (
  echo Start fehlgeschlagen. Laeuft Docker Desktop?
  pause
  exit /b 1
)

echo.
echo Warte, bis die Suite bereit ist (Migrationen, Seed, Start) ...
powershell -NoProfile -Command "for($i=0;$i -lt 90;$i++){ try { if((Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 'http://localhost/').StatusCode -eq 200){ exit 0 } } catch {}; Start-Sleep -Seconds 2 }; exit 1"
if errorlevel 1 (
  echo   WARNUNG: Suite antwortet nach ~3 Minuten noch nicht.
  echo   Pruefe die Logs mit:  docker compose --profile produktion logs
) else (
  echo   Bereit.
)

echo.
echo Suite laeuft. Erreichbar unter:
echo   http://%COMPUTERNAME%
echo   (Tools: /handkassen und /stunden)
echo.
pause

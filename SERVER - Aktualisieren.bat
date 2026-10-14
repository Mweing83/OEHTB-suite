@echo off
REM ============================================================
REM   OEHTB-Suite (Produktivbetrieb) - Aktualisieren
REM   Holt den neuesten Stand aus Git und baut alle Container neu.
REM   Daten/Volumes und die lokale .env bleiben unveraendert.
REM   Migrationen laufen automatisch beim Container-Start.
REM ============================================================
setlocal
cd /d "%~dp0"

REM --- 1. Voraussetzungen pruefen ----------------------------------------
where git >nul 2>nul
if errorlevel 1 (
  echo FEHLER: Git ist nicht installiert oder nicht im PATH.
  echo Bitte Git installieren ^(git-scm.com^) und erneut versuchen.
  pause
  exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo FEHLER: Dieser Ordner ist kein Git-Repository.
  echo Die Suite muss per "git clone" geholt worden sein, damit Updates funktionieren.
  pause
  exit /b 1
)

if not exist ".env" (
  echo FEHLER: .env fehlt. Erst einrichten ^(SERVER - Einrichten.bat^), dann aktualisieren.
  pause
  exit /b 1
)

REM --- 2. Aktuellen Stand merken -----------------------------------------
for /f %%i in ('git rev-parse HEAD') do set VORHER=%%i

echo Hole neuesten Stand von GitHub ...
git pull --ff-only
if errorlevel 1 (
  echo.
  echo FEHLER: "git pull" fehlgeschlagen. Der bisherige Stand wurde NICHT veraendert.
  echo Moegliche Ursachen:
  echo   - Lokale Aenderungen an versionierten Dateien auf dem Server
  echo     ^(die .env ist NICHT betroffen, die bleibt immer lokal^).
  echo   - Fehlende Zugangsdaten fuer das private Repository.
  echo Bitte die Meldung oben pruefen.
  pause
  exit /b 1
)

for /f %%i in ('git rev-parse HEAD') do set NACHHER=%%i

if "%VORHER%"=="%NACHHER%" (
  echo.
  echo Bereits auf dem neuesten Stand - keine neuen Aenderungen.
  echo Die Container werden trotzdem sichergestellt/neu gebaut.
) else (
  echo.
  echo Neue Aenderungen geholt:
  git log --oneline %VORHER%..%NACHHER%
)

REM --- 2b. Schutz: fremde Container an Suite-Volumes? --------------------
REM (zwei Postgres-Instanzen auf einem Volume = Datenverlust)
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\volume-schutz.ps1"
if errorlevel 1 (
  echo.
  echo Update abgebrochen. Container wurden NICHT neu gebaut.
  pause
  exit /b 1
)

REM --- 2c. Sofort-Sicherung aller Datenbanken ^(vor dem Neubau^) -----------
echo.
echo Sichere alle Datenbanken vor dem Update ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\db-sicherung-update.ps1" -Phase vorher
if errorlevel 1 (
  echo.
  echo FEHLER: Sicherung fehlgeschlagen. Update abgebrochen, Container NICHT neu gebaut.
  pause
  exit /b 1
)

REM Beleg-Volume ist in docker-compose.yml "external" ^(stammt aus der Standalone-Zeit^).
docker volume create handkassen_belege_data >nul 2>nul

REM --- 3. Container neu bauen und starten --------------------------------
echo.
echo Baue und starte alle Dienste neu - das kann einige Minuten dauern ...
docker compose --profile produktion up -d --build
if errorlevel 1 (
  echo.
  echo FEHLER: Container-Neubau fehlgeschlagen. Laeuft Docker Desktop?
  pause
  exit /b 1
)

REM Platte freihalten: ungenutzte Images ^(alte Suite-Builds^) und den Docker-Build-Cache
REM entfernen. Betrifft keine Container und keine Volumes/Daten.
docker image prune -a -f >nul 2>nul
docker builder prune -f >nul 2>nul

REM --- 4. Auf Bereitschaft warten ---------------------------------------
echo.
echo Warte, bis die Suite bereit ist ^(Migrationen, Seed, Start^) ...
powershell -NoProfile -Command "for($i=0;$i -lt 90;$i++){ try { if((Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 'http://localhost/').StatusCode -eq 200){ exit 0 } } catch {}; Start-Sleep -Seconds 2 }; exit 1"
if errorlevel 1 (
  echo   WARNUNG: Suite antwortet nach ~3 Minuten noch nicht.
  echo   Status:  SERVER - Status.bat
  echo   Logs:    docker compose --profile produktion logs
) else (
  echo   Bereit.
)

REM --- 5. Plausibilitaetscheck: hat eine Datenbank Zeilen verloren? ------
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\db-sicherung-update.ps1" -Phase nachher
if errorlevel 1 (
  echo.
  echo ACHTUNG: Bitte die Warnung oben lesen, BEVOR jemand mit der Suite arbeitet!
  echo.
)

echo.
echo Aktueller Status:
docker compose --profile produktion ps
echo.
echo Update abgeschlossen. Suite erreichbar unter:
echo   http://%COMPUTERNAME%
echo   ^(Tools: /handkassen  /stunden  /foerderungen^)
echo.
pause
endlocal

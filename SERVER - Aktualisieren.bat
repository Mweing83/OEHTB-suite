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

REM Verwaiste ^(ungetaggte^) Images entfernen, damit die Platte nicht volllaeuft.
docker image prune -f >nul 2>nul

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

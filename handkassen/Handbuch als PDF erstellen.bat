@echo off
REM ============================================================
REM   Erzeugt BENUTZERHANDBUCH.pdf (A4) aus BENUTZERHANDBUCH.md.
REM   Das PDF liegt NICHT im Repo (wird bei Bedarf hier erzeugt).
REM   Benoetigt Node.js (auf dem Entwicklungsrechner vorhanden)
REM   und einmalig Internet (laedt das Werkzeug per npx).
REM ============================================================
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js wurde nicht gefunden. Bitte Node.js installieren und erneut versuchen.
  echo.
  pause
  exit /b 1
)

echo Erzeuge BENUTZERHANDBUCH.pdf ...
echo (Beim ersten Mal kann das etwas dauern - das Werkzeug wird geladen.)
echo.

call npx --yes md-to-pdf "BENUTZERHANDBUCH.md" --pdf-options "{ \"format\": \"A4\", \"margin\": \"20mm\" }"

echo.
if exist "BENUTZERHANDBUCH.pdf" (
  echo Fertig:  BENUTZERHANDBUCH.pdf
) else (
  echo Es konnte kein PDF erstellt werden. Bitte die Meldungen oben pruefen.
)
echo.
pause

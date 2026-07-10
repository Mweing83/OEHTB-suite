@echo off
REM ============================================================
REM   Erzeugt "2026-06 Handkasse Manual.pdf" aus BENUTZERHANDBUCH.md
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

echo Erzeuge "2026-06 Handkasse Manual.pdf" ...
echo (Beim ersten Mal kann das etwas dauern - das Werkzeug wird geladen.)
echo.

call npx --yes md-to-pdf "BENUTZERHANDBUCH.md" --pdf-options "{ \"format\": \"A4\", \"margin\": \"20mm\" }"

if exist "BENUTZERHANDBUCH.pdf" (
  move /Y "BENUTZERHANDBUCH.pdf" "2026-06 Handkasse Manual.pdf" >nul
  echo Fertig:  2026-06 Handkasse Manual.pdf
) else (
  echo Es konnte kein PDF erstellt werden. Bitte die Meldungen oben pruefen.
)
echo.
pause

@echo off
REM ============================================================
REM   OEHTB Handkassen - Wiederherstellung (Restore)
REM   Ruft das PowerShell-Skript restore.ps1 auf.
REM ============================================================
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0restore.ps1"

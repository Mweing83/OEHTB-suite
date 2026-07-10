@echo off
REM ============================================================
REM   OEHTB Handkassen - Doppelklick-Starter
REM   Ruft das PowerShell-Startskript start.ps1 auf.
REM ============================================================
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"

@echo off
REM ============================================================
REM   OEHTB Handkassen - Doppelklick-Stopper
REM ============================================================
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop.ps1"

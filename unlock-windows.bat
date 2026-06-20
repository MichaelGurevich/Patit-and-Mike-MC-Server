@echo off
REM EMERGENCY ONLY: clears a stuck lock if the other person crashed without releasing.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\win-unlock.ps1"
echo.
pause

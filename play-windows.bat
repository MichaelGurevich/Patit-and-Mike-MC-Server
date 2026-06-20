@echo off
REM Play TOGETHER (same Wi-Fi / network). Pulls the latest world, then hosts.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\win-play.ps1" -Mode local
echo.
pause

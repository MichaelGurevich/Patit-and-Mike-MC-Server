@echo off
REM Play APART (over the internet via Tailscale). Pulls the latest world, then hosts.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\win-play.ps1" -Mode online
echo.
pause

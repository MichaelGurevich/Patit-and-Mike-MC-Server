@echo off
REM One-time setup: downloads the Minecraft server and installs Tailscale.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\win-setup.ps1"
echo.
pause

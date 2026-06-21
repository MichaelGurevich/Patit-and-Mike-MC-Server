@echo off
REM Launch the MC Server Dashboard (installs + builds the first time).
cd /d "%~dp0dashboard"
if not exist node_modules (
  echo Installing dependencies for the first time, please wait...
  call npm install
)
call npm run build
call npx electron .

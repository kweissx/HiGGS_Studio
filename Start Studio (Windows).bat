@echo off
title Higgsfield Studio
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed yet.
  echo Please install the LTS version from https://nodejs.org and then double-click this file again.
  echo.
  start "" https://nodejs.org
  pause
  exit /b
)
node server.js
pause

@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo Generating .\assets\maps\index.json ...
where node >nul 2>nul
if errorlevel 1 (
  echo [ERR] Node.js not found on PATH. Install from https://nodejs.org/ and retry.
  pause
  exit /b 1
)

node "%~dp0generate-maps-index.js"
echo.
echo Done.
pause

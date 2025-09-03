@echo off
REM Generate assets/maps/index.json by scanning assets/maps/
REM Usage: Double-click this file.
node tools\generate-maps-index.js
echo.
echo Done. If you saw "Wrote assets\maps\index.json ...", it worked.
echo Press any key to exit.
pause >nul

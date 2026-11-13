@echo off
cd /d "%~dp0"
echo Starting UUDS DXB Workshop Roster Command Dashboard...
start "" "http://localhost:3001"
node server/index.js
pause

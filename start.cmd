@echo off
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0"
echo Starting Instaloop Mindful Backend...
node dist/server.js

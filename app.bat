@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist data mkdir data
set APP_MODE=1
set OPEN_BROWSER=1
pushd server
call npm install --no-audit --no-fund > "..\data\install.log" 2>&1
call npm run build --silent > "..\data\build.log" 2>&1
popd
node server\dist\main.js > "data\server.log" 2>&1

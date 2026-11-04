@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Платок и Борода

where node >nul 2>nul
if errorlevel 1 goto nonode

echo Проверяю зависимости сервера (при первом запуске 1-2 минуты)...
pushd server
call npm install --no-audit --no-fund
if errorlevel 1 goto npmfail
popd

:build
echo Собираю сервер...
pushd server
call npm run build --silent
if errorlevel 1 goto npmfail
popd

set OPEN_BROWSER=1
node server\dist\main.js
pause
exit /b

:nonode
echo Node.js не найден. Установи версию LTS с https://nodejs.org и запусти start.bat снова.
echo Пока открываю офлайн-версию игры - рекорды будут храниться только в браузере.
start "" "%~dp0client\index.html"
pause
exit /b

:npmfail
popd
echo Не получилось установить или собрать сервер. Проверь интернет и запусти ещё раз.
echo Пока открываю офлайн-версию игры.
start "" "%~dp0client\index.html"
pause

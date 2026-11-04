@echo off
chcp 65001 >nul
cd /d "%~dp0desktop"
echo Собираю настольную версию: скачается Electron (около 100 МБ), это несколько минут...
call npm install --no-audit --no-fund
if errorlevel 1 goto fail
call npm run dist
if errorlevel 1 goto fail
echo.
echo Готово! Программа: desktop\dist\PlatokIBoroda-win32-x64\PlatokIBoroda.exe
echo Она работает без сервера и без Node.js, рекорды хранит у себя.
pause
exit /b
:fail
echo Не получилось собрать. Проверь интернет и запусти ещё раз.
pause

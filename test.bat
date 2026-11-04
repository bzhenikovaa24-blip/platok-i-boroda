@echo off
chcp 65001 >nul
cd /d "%~dp0server"
echo Устанавливаю зависимости и запускаю автотесты API...
call npm install --no-audit --no-fund >nul 2>&1
call npm test
pause

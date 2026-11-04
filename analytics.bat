@echo off
chcp 65001 >nul
cd /d "%~dp0"
where python >nul 2>nul && (set PY=python) || (set PY=py)
%PY% tools\analytics.py --open
pause

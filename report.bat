@echo off
chcp 65001 >nul
cd /d "%~dp0"
where python >nul 2>nul && (set PY=python) || (set PY=py)
%PY% tools\level_tool.py report --html
if exist data\report.html start "" "data\report.html"
pause

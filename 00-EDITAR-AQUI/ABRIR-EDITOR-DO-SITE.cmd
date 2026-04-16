@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0editor-do-site.ps1"
endlocal

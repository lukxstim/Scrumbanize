@echo off
rem Doppelklick: richtet das tägliche Scrumbanize-Backup ein (install.ps1, ohne die Sperre für Skripte).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
echo.
pause

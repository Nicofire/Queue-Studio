@echo off
REM Starter fuer Stream Deck - die eigentliche Logik steckt in stop-servers.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-servers.ps1"

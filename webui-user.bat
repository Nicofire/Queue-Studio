@echo off
REM %~dp0 = folder of this script, so it works from any working directory
pushd "%~dp0"
call npm run dev -- --open
popd
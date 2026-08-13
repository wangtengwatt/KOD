@echo off
setlocal
set "ProjectRoot=%~dp0"
pushd "%ProjectRoot%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File "%ProjectRoot%start-kod-dev.ps1"
set "ExitCode=%errorlevel%"
popd
exit /b %ExitCode%

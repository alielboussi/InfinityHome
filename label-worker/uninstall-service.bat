@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

set "SERVICE_NAME=LabelPrinter"
set "NSSM_EXE=%~dp0nssm.exe"

if not exist "!NSSM_EXE!" (
  echo NSSM not found: !NSSM_EXE!
  pause
  exit /b 1
)

"!NSSM_EXE!" stop "!SERVICE_NAME!"
"!NSSM_EXE!" remove "!SERVICE_NAME!" confirm

echo.
echo Service removed: %SERVICE_NAME%
echo.
pause

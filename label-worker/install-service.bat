@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

set "DO_PAUSE=1"
if /I "%~1"=="--no-pause" set "DO_PAUSE="

set "SERVICE_NAME=LabelPrinter"
set "NSSM_EXE=%~dp0nssm.exe"
set "EXE_PATH=%~dp0dist\LabelPrinter.exe"
set "LOG_DIR=%~dp0logs"

if not exist "!NSSM_EXE!" (
  echo NSSM not found: !NSSM_EXE!
  echo Place nssm.exe in this folder.
  pause
  exit /b 1
)

if not exist "!EXE_PATH!" (
  echo LabelPrinter.exe not found: !EXE_PATH!
  echo Run build-exe.bat first.
  pause
  exit /b 1
)

if not exist "!LOG_DIR!" mkdir "!LOG_DIR!"

"!NSSM_EXE!" install "!SERVICE_NAME!" "!EXE_PATH!"
"!NSSM_EXE!" set "!SERVICE_NAME!" AppDirectory "%~dp0"
"!NSSM_EXE!" set "!SERVICE_NAME!" DisplayName "Label Printer Worker"
"!NSSM_EXE!" set "!SERVICE_NAME!" Description "Polls label_print_jobs and prints labels on Godex EZ120"
"!NSSM_EXE!" set "!SERVICE_NAME!" Start SERVICE_AUTO_START
"!NSSM_EXE!" set "!SERVICE_NAME!" AppStdout "!LOG_DIR!\label-worker.log"
"!NSSM_EXE!" set "!SERVICE_NAME!" AppStderr "!LOG_DIR!\label-worker.err.log"

"!NSSM_EXE!" start "!SERVICE_NAME!"

echo.
echo Service installed and started: %SERVICE_NAME%
echo Open Services.msc to confirm.
echo.
if defined DO_PAUSE pause

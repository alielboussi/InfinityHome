@echo off
setlocal
cd /d "%~dp0"

set ISS=%~dp0installer\LabelPrinterInstaller.iss
set EXE_PATH=%~dp0dist\LabelPrinter.exe
set NSSM_EXE=%~dp0nssm.exe

if not exist "%ISS%" (
  echo Missing installer script: %ISS%
  exit /b 1
)

if not exist "%EXE_PATH%" (
  echo LabelPrinter.exe not found: %EXE_PATH%
  echo Run build-exe.bat first.
  exit /b 1
)

if not exist "%NSSM_EXE%" (
  echo NSSM not found: %NSSM_EXE%
  echo Place nssm.exe in this folder.
  exit /b 1
)

where /q ISCC
if errorlevel 1 (
  echo ISCC not found in PATH.
  echo Install Inno Setup and add ISCC to PATH.
  exit /b 1
)

ISCC "%ISS%"

echo.
echo Installer created in %~dp0installer\dist-installer\LabelPrinterInstaller.exe
echo.

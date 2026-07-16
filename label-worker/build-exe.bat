@echo off
setlocal
cd /d "%~dp0"

set "PYTHON_EXE=%~dp0..\.venv\Scripts\python.exe"

if not exist "%PYTHON_EXE%" (
	echo Python venv not found: %PYTHON_EXE%
	echo Create it with: python -m venv ..\.venv
	exit /b 1
)

"%PYTHON_EXE%" -m pip install --upgrade pip
"%PYTHON_EXE%" -m pip install pyinstaller==6.20.0 requests

"%PYTHON_EXE%" -m PyInstaller --onefile --name LabelPrinter --hidden-import win32print --hidden-import win32api --hidden-import win32con --hidden-import pywintypes --collect-all requests --collect-all pywin32 --collect-all win32 --collect-all pythonwin worker.py

echo.
echo Built: %~dp0dist\LabelPrinter.exe
echo.

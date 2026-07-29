@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo The Desktop environment is not installed.
  echo Run setup_and_start.cmd first.
  pause
  exit /b 1
)

".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -r requirements-build.txt
if errorlevel 1 goto :failed

".venv\Scripts\python.exe" -m PyInstaller --noconfirm --clean SpeechBubble4komaEditor.spec
if errorlevel 1 goto :failed

copy /y "README.md" "dist\SpeechBubble4komaEditor\README.md" >nul
copy /y "LICENSE" "dist\SpeechBubble4komaEditor\LICENSE" >nul
copy /y "PRIVACY.md" "dist\SpeechBubble4komaEditor\PRIVACY.md" >nul
copy /y "SECURITY.md" "dist\SpeechBubble4komaEditor\SECURITY.md" >nul
copy /y "THIRD-PARTY-NOTICES.md" "dist\SpeechBubble4komaEditor\THIRD-PARTY-NOTICES.md" >nul

echo.
echo Portable build:
echo %CD%\dist\SpeechBubble4komaEditor\SpeechBubble4komaEditor.exe
exit /b 0

:failed
echo.
echo Build failed. Check the message above.
pause
exit /b 1

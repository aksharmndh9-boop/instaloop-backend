@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ========================================================
echo  🌿 Instaloop - Set Google Gemini API Key
echo ========================================================
echo.

set "KEY=%~1"

if "%KEY%"=="" (
  echo Please paste your Gemini API Key below (starts with AIza...):
  set /p "KEY=> "
)

if "%KEY%"=="" (
  echo [ERROR] No key provided. Operation cancelled.
  pause
  exit /b 1
)

:: Create or update .env file with GEMINI_API_KEY
powershell -Command "$envPath = '.env'; $content = Get-Content $envPath; if ($content -match '^GEMINI_API_KEY=') { $content = $content -replace '^GEMINI_API_KEY=.*', 'GEMINI_API_KEY=\"%KEY%\"' } else { $content += 'GEMINI_API_KEY=\"%KEY%\"' }; [System.IO.File]::WriteAllLines($envPath, $content); Write-Host 'Successfully saved GEMINI_API_KEY to backend/.env!'"

echo.
echo ========================================================
echo  ✨ Gemini AI is now activated for Instaloop!
echo ========================================================
echo.
pause

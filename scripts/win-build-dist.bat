@echo off
cd /d "%~dp0.."
call scripts\win-build-native.bat
if errorlevel 1 exit /b 1
npm run dist
exit /b %ERRORLEVEL%
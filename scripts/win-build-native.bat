@echo off
setlocal EnableDelayedExpansion

set "VSINSTALLDIR="
for /f "usebackq delims=" %%I in (`"%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2^>nul`) do set "VSINSTALLDIR=%%I"

if "%VSINSTALLDIR%"=="" (
  echo [error] Visual Studio C++ toolchain not found.
  exit /b 1
)

set "VCToolsVersion="
for /f "delims=" %%V in ('dir /b /ad "%VSINSTALLDIR%\VC\Tools\MSVC\14.*" 2^>nul') do (
  if exist "%VSINSTALLDIR%\VC\Tools\MSVC\%%V\bin\Hostx64\x64\cl.exe" set "VCToolsVersion=%%V"
)

if "%VCToolsVersion%"=="" (
  echo [error] MSVC compiler not found.
  exit /b 1
)

if "%PYTHON%"=="" (
  for /f "delims=" %%P in ('where python 2^>nul') do set "PYTHON=%%P" & goto py_done
  if exist "%USERPROFILE%\.venv\Scripts\python.exe" set "PYTHON=%USERPROFILE%\.venv\Scripts\python.exe"
  if exist "%USERPROFILE%\venv\Scripts\python.exe" set "PYTHON=%USERPROFILE%\venv\Scripts\python.exe"
)
:py_done

if "%PYTHON%"=="" (
  echo [error] Python not found. Set PYTHON env var first.
  exit /b 1
)

set "MSVC_ROOT=%VSINSTALLDIR%\VC\Tools\MSVC\%VCToolsVersion%"
set "WINSDK_VER="
for /f "delims=" %%S in ('dir /b /ad "%ProgramFiles(x86)%\Windows Kits\10\include\10.*" 2^>nul') do set "WINSDK_VER=%%S"

if "%WINSDK_VER%"=="" (
  echo [error] Windows SDK not found.
  exit /b 1
)

set "PATH=%MSVC_ROOT%\bin\Hostx64\x64;%VSINSTALLDIR%\MSBuild\Current\Bin;%PATH%"
set "INCLUDE=%MSVC_ROOT%\include;%VSINSTALLDIR%\VC\Auxiliary\VS\include;%ProgramFiles(x86)%\Windows Kits\10\include\%WINSDK_VER%\ucrt;%ProgramFiles(x86)%\Windows Kits\10\include\%WINSDK_VER%\um;%ProgramFiles(x86)%\Windows Kits\10\include\%WINSDK_VER%\shared"
set "LIB=%MSVC_ROOT%\lib\x64;%ProgramFiles(x86)%\Windows Kits\10\lib\%WINSDK_VER%\ucrt\x64;%ProgramFiles(x86)%\Windows Kits\10\lib\%WINSDK_VER%\um\x64"

cd /d "%~dp0.."
echo [info] MSVC %VCToolsVersion%
node scripts\patch-sqlite3-vctools.js
if errorlevel 1 exit /b 1

if exist node_modules\sqlite3\build rmdir /s /q node_modules\sqlite3\build

npx --yes @electron/rebuild -f -w sqlite3,sharp -v 23.2.0
exit /b %ERRORLEVEL%
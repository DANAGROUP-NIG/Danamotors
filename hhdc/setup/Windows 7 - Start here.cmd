@echo off
rem Kia Motors Handheld station setup on Windows 7: installs what Windows 10 and 11 already have
rem (Microsoft .NET Framework 4.8, from payload\dotnet), then opens HHDC Station Setup.exe.
rem Windows 10/11: not needed, open HHDC Station Setup.exe directly.
rem Keep CRLF line endings (make_station_kit.ps1 writes them): cmd's goto misreads LF-only files.
setlocal EnableExtensions
title Kia Motors Handheld - station setup (Windows 7)
cd /d "%~dp0"
set "SETUP=%~dp0HHDC Station Setup.exe"
set "NDP=%~dp0payload\dotnet\ndp48-x86-x64-allos-enu.exe"
set "RUNONCE=HKCU\Software\Microsoft\Windows\CurrentVersion\RunOnce"
set "REG=%SystemRoot%\System32\reg.exe"
set "FIND=%SystemRoot%\System32\find.exe"
"%REG%" delete "%RUNONCE%" /v "KMHH station setup" /f >nul 2>&1

rem .NET 4.8 needs Windows 7 Service Pack 1 (build 7601).
set VMAJ=0& set VMIN=0& set VBLD=0
for /f "tokens=4-6 delims=[]. " %%a in ('ver') do (set VMAJ=%%a& set VMIN=%%b& set VBLD=%%c)
if "%VMAJ%.%VMIN%"=="6.1" if %VBLD% LSS 7601 (
  echo.
  echo This PC runs Windows 7 without Service Pack 1. Install Service Pack 1 first
  echo ^(Windows Update, or ask IT^), restart, then double-click this file again.
  echo Nothing has been changed on this PC.
  echo.
  pause
  exit /b 1
)

rem .NET Framework 4.8 = Release 528040 or more. Windows' own reg.exe and find.exe, never another "find" on the PATH.
set REL=0
"%REG%" query "HKLM\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full" /v Release > "%TEMP%\kmhh-net.txt" 2>nul
for /f "tokens=3" %%r in ('type "%TEMP%\kmhh-net.txt" ^| "%FIND%" /i "Release"') do set /a REL=%%r
del "%TEMP%\kmhh-net.txt" >nul 2>&1
if %REL% GEQ 528040 goto run

if not exist "%NDP%" (
  echo.
  echo payload\dotnet\ndp48-x86-x64-allos-enu.exe is missing from this folder.
  echo If the antivirus removed it, restore it and run this again.
  echo.
  pause
  exit /b 1
)
echo.
echo This PC needs Microsoft .NET Framework 4.8 for the handheld station
echo ^(Windows 10 and 11 already have it^).
echo Installing it now. Windows asks for an administrator; it takes 5 to 10 minutes.
echo.
start "" /wait "%NDP%" /passive /norestart
set RC=%errorlevel%
if "%RC%"=="0" goto run
if "%RC%"=="3010" goto restart
if "%RC%"=="1641" goto restart
echo.
if "%RC%"=="1602" echo The installation was cancelled. Nothing else was changed.
if "%RC%"=="5100" echo This PC does not meet .NET 4.8's requirements ^(Windows 7 Service Pack 1, enough disk space^).
if not "%RC%"=="1602" if not "%RC%"=="5100" echo .NET Framework 4.8 did not install ^(code %RC%^). Restart the PC and try again, or ask IT.
echo.
pause
exit /b 1

:restart
"%REG%" add "%RUNONCE%" /v "KMHH station setup" /t REG_SZ /d "\"%~f0\"" /f >nul
echo.
echo .NET Framework 4.8 is installed. Windows must restart to finish.
echo The station setup opens by itself when you sign in again.
echo.
choice /c YN /m "Restart now"
if errorlevel 2 (
  echo Restart when you are ready; the setup opens at the next sign-in.
  pause
  exit /b 0
)
shutdown /r /t 5
exit /b 0

:run
start "" "%SETUP%"
exit /b 0

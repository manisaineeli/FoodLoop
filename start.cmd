@echo off
rem ================================================================
rem  FoodLoop one-click launcher
rem  1. Starts the local MongoDB service (if installed)
rem  2. Starts the FoodLoop Express server on http://localhost:5000
rem  3. Opens the app in your default browser
rem
rem  The server keeps running in its own window after this closes.
rem ================================================================
setlocal
cd /d "%~dp0"

echo.
echo  FoodLoop launcher
echo  -----------------

echo [1/3] Checking MongoDB on 127.0.0.1:27017 ...
powershell -NoProfile -Command "try { $c = Get-NetTCPConnection -LocalPort 27017 -State Listen -ErrorAction Stop; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
  echo        MongoDB already listening - OK.
) else (
  echo        MongoDB not running - starting the MongoDB service...
  sc start MongoDB >nul 2>&1
  if errorlevel 1 (
    echo        Could not start MongoDB automatically. Start mongod, then run this again.
  )
)
call :sleep 2

echo [2/3] Starting FoodLoop API server on http://localhost:5000 ...
powershell -NoProfile -Command "try { $c = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction Stop; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
  echo        Already running - skipping server start.
) else (
  if not exist node_modules\express (
    echo        Installing dependencies for the first time...
    call npm install
  )
  rem Start-Process fails outright if the redirect folder is missing,
  rem so it has to exist before the server is launched.
  if not exist "%USERPROFILE%\.foodloop" mkdir "%USERPROFILE%\.foodloop"
  if exist "%USERPROFILE%\.foodloop\foodloop.log" (
    rem keep a small history, then overwrite the newest log
    type "%USERPROFILE%\.foodloop\foodloop.log" >> "%USERPROFILE%\.foodloop\foodloop-prev.log" 2>nul
    del "%USERPROFILE%\.foodloop\foodloop.log" 2>nul
  )
  rem Start detached: -WindowStyle Hidden + redirected output means the
  rem server has no console, so it is not killed when this script exits.
  powershell -NoProfile -Command "Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList 'server.js' -WorkingDirectory '%~dp0' -WindowStyle Hidden -RedirectStandardOutput '%USERPROFILE%\.foodloop\foodloop.log' -RedirectStandardError '%USERPROFILE%\.foodloop\foodloop.err'"
)

echo [3/3] Waiting for the server to come up ...
:wait_api
call :sleep 1
powershell -NoProfile -Command "try { $null = Invoke-WebRequest -Uri 'http://127.0.0.1:5000/api/bootstrap' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 goto wait_api

echo.
echo  FoodLoop is live:  http://localhost:5000
echo  (Server window was opened minimized - log file:
echo   %USERPROFILE%\.foodloop\foodloop.log )
echo.
start "" "http://localhost:5000"
endlocal
exit /b 0

rem portable sleep: ping is available on every Windows version
:sleep
ping -n %1 127.0.0.1 >nul 2>&1
exit /b 0
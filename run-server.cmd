@echo off
rem FoodLoop API server runner - logs to %USERPROFILE%\.foodloop\foodloop.log
cd /d "%~dp0"
if not exist "%USERPROFILE%\.foodloop" mkdir "%USERPROFILE%\.foodloop"
node server.js >> "%USERPROFILE%\.foodloop\foodloop.log" 2>&1
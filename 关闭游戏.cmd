@echo off
setlocal
set "PID="

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:"127\.0\.0\.1:4173 .*LISTENING"') do set "PID=%%P"
if not defined PID goto notfound

tasklist /fi "PID eq %PID%" /fo csv /nh | findstr /i /c:"node.exe" >nul
if errorlevel 1 goto wrongprocess

taskkill /pid %PID% /f >nul
if errorlevel 1 goto failed
echo Game server stopped.
goto end

:notfound
echo No running game server was found.
goto end

:wrongprocess
echo Port 4173 is not owned by Node.js, so nothing was stopped.
goto end

:failed
echo Unable to stop the game server.

:end
pause

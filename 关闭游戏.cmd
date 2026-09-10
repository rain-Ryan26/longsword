@echo off
setlocal
cd /d "%~dp0"

set "SERVER=%~dp0server.mjs"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$server = [regex]::Escape($env:SERVER); $processes = Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { $_.CommandLine -match $server }; if ($processes) { $processes | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host ('已关闭游戏服务器（PID ' + $_.ProcessId + '）。') } } else { Write-Host '未发现正在运行的本游戏服务器。' }"
pause

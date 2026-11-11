@echo off
setlocal
title Allow inbound TCP 8000 for the kuaidi daily report

net session >nul 2>&1
if not "%errorlevel%"=="0" (
    echo Requesting administrator privileges, please click YES on the UAC dialog...
    powershell -NoProfile -Command "Start-Process -Verb RunAs -FilePath '%~f0'"
    exit /b
)

echo.
echo [1/3] Removing old rule if present...
netsh advfirewall firewall delete rule name="kuaidi-report-8000" >nul 2>&1

echo [2/3] Adding inbound rule: TCP 8000, source limited to local subnet...
netsh advfirewall firewall add rule name="kuaidi-report-8000" dir=in action=allow protocol=TCP localport=8000 remoteip=LocalSubnet profile=any
if errorlevel 1 goto fail

echo.
echo [3/3] Rule now in effect:
netsh advfirewall firewall show rule name="kuaidi-report-8000"

echo.
echo ============================================================
echo  Done. Open this address from this PC or any device on the
echo  same Wi-Fi / LAN:
echo ============================================================
powershell -NoProfile -Command "foreach ($a in Get-NetIPAddress -AddressFamily IPv4) { if ($a.IPAddress -notmatch '^(127\.|169\.254\.)') { Write-Host ('   http://{0}:8000' -f $a.IPAddress) } }"
echo    http://%COMPUTERNAME%:8000
echo.
echo  If other devices still cannot open it, the Wi-Fi router may be
echo  using client isolation, or the phone/PC is on a different network.
echo.
pause
exit /b 0

:fail
echo.
echo Failed to add the firewall rule. If this machine has no local
echo administrator rights, ask IT to allow inbound TCP 8000.
echo.
pause
exit /b 1

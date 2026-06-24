# DigiBank full-stack startup script.
# Starts all 7 backend microservices + the Angular dev server with ONE command, from
# the ONE terminal you're already in - no extra visible windows:
#   .\start-all.ps1
#
# Each service runs hidden in the background with its output redirected to a log file
# under .\logs\, then this script BLOCKS until that service's port is actually listening
# before launching the next one. This is not cosmetic pacing - launching all 7
# `mvnd spring-boot:run` builds at once causes them to fight over shared lock files under
# C:\Users\<you>\.m2\repository\.locks, which fails the build outright (BUILD FAILURE,
# "Could not open file channel for ...lock after 5 attempts; giving up") rather than just
# slowing it down. Strictly sequential startup removes the race instead of gambling on a
# fixed delay.
#
# If a service fails to bind its port within $serviceTimeoutSeconds, this script retries
# it once before giving up and moving on (so one bad service doesn't block the rest of
# the stack). Tail a service's log with: Get-Content .\logs\<service>.log -Wait -Tail 30
#
# To stop everything started by this script: .\stop-all.ps1

$services = @(
    @{ name = "api-gateway";           port = 8080 },
    @{ name = "auth-service";          port = 8081 },
    @{ name = "application-service";   port = 8082 },
    @{ name = "affordability-service"; port = 8083 },
    @{ name = "product-service";       port = 8084 },
    @{ name = "document-service";      port = 8085 },
    @{ name = "notification-service";  port = 8086 }
)

$backendDir = "$PSScriptRoot\backend"
$frontendDir = "$PSScriptRoot\frontend"
$logDir = "$PSScriptRoot\logs"
$pidFile = "$logDir\pids.txt"
$javaPath = 'C:\Program Files\Java\jdk-26.0.1\bin'
$mvndPath = 'C:\tools\maven-mvnd-1.0.6-windows-amd64\bin'
$serviceTimeoutSeconds = 90
$pollIntervalSeconds = 2

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Remove-Item -Force -ErrorAction SilentlyContinue $pidFile

function Wait-ForPort {
    param([int]$Port, [int]$TimeoutSeconds)
    $elapsed = 0
    while ($elapsed -lt $TimeoutSeconds) {
        $ok = (Test-NetConnection -ComputerName localhost -Port $Port -WarningAction SilentlyContinue).TcpTestSucceeded
        if ($ok) { return $true }
        Start-Sleep -Seconds $pollIntervalSeconds
        $elapsed += $pollIntervalSeconds
    }
    return $false
}

function Start-BackendService {
    param([string]$Name, [string]$Path)
    $log = "$logDir\$Name.log"
    Remove-Item -Force -ErrorAction SilentlyContinue $log
    $proc = Start-Process powershell -WindowStyle Hidden -PassThru -ArgumentList "-NoExit", "-Command",
        "`$env:Path = '$javaPath;$mvndPath;' + `$env:Path; Set-Location '$Path'; mvnd spring-boot:run *>> '$log'"
    "$Name=$($proc.Id)" | Add-Content -Path $pidFile
}

Write-Host "Starting DigiBank stack (sequential, port-gated, no extra windows)..." -ForegroundColor Cyan
Write-Host "Logs: $logDir" -ForegroundColor Cyan
Write-Host ""

$failed = @()

foreach ($svc in $services) {
    $svcPath = "$backendDir\$($svc.name)"
    Write-Host "Starting $($svc.name) on port $($svc.port)..." -ForegroundColor Yellow
    Start-BackendService -Name $svc.name -Path $svcPath

    if (Wait-ForPort -Port $svc.port -TimeoutSeconds $serviceTimeoutSeconds) {
        Write-Host "  $($svc.name) is up on $($svc.port)." -ForegroundColor Green
        continue
    }

    Write-Host "  $($svc.name) did not bind $($svc.port) within ${serviceTimeoutSeconds}s - retrying once..." -ForegroundColor Red
    Start-BackendService -Name $svc.name -Path $svcPath

    if (Wait-ForPort -Port $svc.port -TimeoutSeconds $serviceTimeoutSeconds) {
        Write-Host "  $($svc.name) is up on $($svc.port) after retry." -ForegroundColor Green
    } else {
        Write-Host "  $($svc.name) FAILED twice - check $logDir\$($svc.name).log for the error." -ForegroundColor Red
        $failed += $svc.name
    }
}

Write-Host ""
Write-Host "Starting Angular dev server (bound to 0.0.0.0:4200)..." -ForegroundColor Yellow
$feLog = "$logDir\frontend.log"
Remove-Item -Force -ErrorAction SilentlyContinue $feLog
$feProc = Start-Process powershell -WindowStyle Hidden -PassThru -ArgumentList "-NoExit", "-Command",
    "Set-Location '$frontendDir'; ng serve --host 0.0.0.0 --port 4200 *>> '$feLog'"
"frontend=$($feProc.Id)" | Add-Content -Path $pidFile

if (Wait-ForPort -Port 4200 -TimeoutSeconds $serviceTimeoutSeconds) {
    Write-Host "  Angular dev server is up on 4200." -ForegroundColor Green
} else {
    Write-Host "  Angular dev server did not bind 4200 within ${serviceTimeoutSeconds}s - check $feLog." -ForegroundColor Red
    $failed += "frontend"
}

Write-Host ""
if ($failed.Count -eq 0) {
    Write-Host "All services up. App reachable at: http://$($env:COMPUTERNAME):4200/  (or http://<this-machine-IP>:4200/)" -ForegroundColor Cyan
} else {
    Write-Host "Started with failures: $($failed -join ', ')" -ForegroundColor Red
}
Write-Host "Everything is running hidden in the background. Stop it all with: .\stop-all.ps1" -ForegroundColor Cyan

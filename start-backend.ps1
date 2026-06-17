# DigiBank Backend Startup Script
# Starts all microservices in separate PowerShell windows

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

Write-Host "Starting DigiBank Microservices..." -ForegroundColor Cyan
Write-Host ""

foreach ($svc in $services) {
    $svcPath = "$backendDir\$($svc.name)"
    Write-Host "Starting $($svc.name) on port $($svc.port)..." -ForegroundColor Yellow

    Start-Process powershell -ArgumentList "-NoExit", "-Command",
        "`$env:Path = 'C:\Program Files\Java\jdk-26.0.1\bin;C:\tools\maven-mvnd-1.0.6-windows-amd64\bin;' + `$env:Path; Set-Location '$svcPath'; Write-Host 'Starting $($svc.name)...' -ForegroundColor Green; mvnd spring-boot:run"

    Start-Sleep -Seconds 2
}

Write-Host ""
Write-Host "All services starting. Check individual windows for startup progress." -ForegroundColor Green
Write-Host "API Gateway will be available at: http://localhost:8080" -ForegroundColor Cyan
Write-Host "Angular Frontend:                 http://localhost:4200" -ForegroundColor Cyan

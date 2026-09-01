# DigiBank Backend Startup Script
# Starts all microservices in separate PowerShell windows

# service-registry (Eureka) goes first and gets a longer head start — ARCHITECTURE_REVIEW_GAPS.md
# G3: api-gateway's routes are now lb://<service> (resolved dynamically via the registry) instead
# of hardcoded host:port, so it can only route once the registry is up and the target service has
# registered. Every other service still starts fine without it (they only register themselves,
# they don't depend on it to find anything), but the gateway will 500 on every route until the
# registry is reachable and at least the target service has checked in.
# rule-service and integration-service also go early, before the services that call them directly
# (a static URL, not Eureka lb://) — ARCHITECTURE_REVIEW_GAPS.md G4/G5: affordability-service's
# rules assessment and application-service's mandate-limit enforcement call rule-service;
# auth-service's OTP issuance and application-service's data-verification/business-financials calls
# call integration-service. Every one of those services still starts up fine without it — only
# those specific calls fail until it's reachable.
$services = @(
    @{ name = "service-registry";      port = 8761 },
    @{ name = "rule-service";          port = 8087 },
    @{ name = "integration-service";   port = 8088 },
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

    if ($svc.name -eq "service-registry" -or $svc.name -eq "rule-service" -or $svc.name -eq "integration-service") {
        Start-Sleep -Seconds 8
    } else {
        Start-Sleep -Seconds 2
    }
}

Write-Host ""
Write-Host "All services starting. Check individual windows for startup progress." -ForegroundColor Green
Write-Host "API Gateway will be available at: http://localhost:8080" -ForegroundColor Cyan
Write-Host "Angular Frontend:                 http://localhost:4200" -ForegroundColor Cyan

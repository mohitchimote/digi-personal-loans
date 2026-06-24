# Stops everything started by start-all.ps1 (reads PIDs from .\logs\pids.txt).
# Tree-kills each recorded process so the java/mvnd children launched inside the
# hidden PowerShell wrapper get terminated too, not just the wrapper itself.

$pidFile = "$PSScriptRoot\logs\pids.txt"

if (-not (Test-Path $pidFile)) {
    Write-Host "No $pidFile found - nothing recorded to stop. (Were services started with start-all.ps1?)" -ForegroundColor Yellow
    exit
}

Get-Content $pidFile | ForEach-Object {
    $parts = $_ -split '='
    if ($parts.Length -ne 2) { return }
    $name = $parts[0]
    $procId = $parts[1]

    if (Get-Process -Id $procId -ErrorAction SilentlyContinue) {
        Write-Host "Stopping $name (PID $procId)..." -ForegroundColor Yellow
        taskkill /PID $procId /T /F | Out-Null
    } else {
        Write-Host "$name (PID $procId) already gone." -ForegroundColor DarkGray
    }
}

Remove-Item -Force -ErrorAction SilentlyContinue $pidFile
Write-Host "Done." -ForegroundColor Cyan

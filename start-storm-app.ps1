param(
    [string]$BackendHost = "127.0.0.1",
    [int]$BackendPort = 8000,
    [string]$FrontendHost = "127.0.0.1",
    [int]$FrontendPort = 5173,
    [int]$FrontendDelaySeconds = 15,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $repoRoot "storm_webapp"
$frontendDir = Join-Path $repoRoot "frontend"
$backendBootstrapPath = Join-Path $env:TEMP "storm_backend_startup.ps1"
$frontendBootstrapPath = Join-Path $env:TEMP "storm_frontend_startup.ps1"
$venvPython = Join-Path $repoRoot "Storm-venv\Scripts\python.exe"
$venvDaphne = Join-Path $repoRoot "Storm-venv\Scripts\daphne.exe"
$npmCmd = (Get-Command npm.cmd -ErrorAction Stop).Source

if (-not (Test-Path $venvPython)) {
    throw "Python virtual environment was not found at: $venvPython"
}

if (-not (Test-Path $venvDaphne)) {
    throw "Daphne was not found at: $venvDaphne"
}

if (-not (Test-Path $backendDir)) {
    throw "Backend directory was not found at: $backendDir"
}

if (-not (Test-Path $frontendDir)) {
    throw "Frontend directory was not found at: $frontendDir"
}

$modelCheckPython = @"
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "storm_webapp.settings.local")

import django
django.setup()

from django.conf import settings
from ml_engine.predictor import get_predictor

print(f"STORM_MODEL_PATH={settings.STORM_MODEL_PATH}")
print(f"MODEL_EXISTS={os.path.exists(settings.STORM_MODEL_PATH)}")
print(f"PREDICTOR_READY={get_predictor() is not None}")
"@

$backendBootstrap = @"
try {
    Set-Location '$backendDir'
    Write-Host 'Checking Django project...' -ForegroundColor Cyan
    & '$venvPython' manage.py check
    if (`$LASTEXITCODE -ne 0) { throw "manage.py check failed with exit code `$LASTEXITCODE" }

    Write-Host 'Verifying prediction model load...' -ForegroundColor Cyan
    @'
$modelCheckPython
'@ | & '$venvPython' -
    if (`$LASTEXITCODE -ne 0) { throw "Prediction model verification failed with exit code `$LASTEXITCODE" }

    Write-Host 'Starting Daphne backend on http://$BackendHost`:$BackendPort' -ForegroundColor Green
    & '$venvDaphne' -b $BackendHost -p $BackendPort storm_webapp.asgi:application
    if (`$LASTEXITCODE -ne 0) { throw "Daphne exited with exit code `$LASTEXITCODE" }
}
catch {
    Write-Host ('Backend startup failed: ' + `$_.Exception.Message) -ForegroundColor Red
    Write-Host 'The backend window will stay open for troubleshooting.' -ForegroundColor Yellow
}
"@

$frontendBootstrap = @"
try {
    Set-Location '$frontendDir'
    Write-Host 'Starting Vite frontend on http://$FrontendHost`:$FrontendPort' -ForegroundColor Green
    & '$npmCmd' run dev -- --host $FrontendHost --port $FrontendPort
    if (`$LASTEXITCODE -ne 0) { throw "Frontend exited with exit code `$LASTEXITCODE" }
}
catch {
    Write-Host ('Frontend startup failed: ' + `$_.Exception.Message) -ForegroundColor Red
    Write-Host 'The frontend window will stay open for troubleshooting.' -ForegroundColor Yellow
}
"@

if ($DryRun) {
    Write-Host "Backend command window script:" -ForegroundColor Yellow
    Write-Host $backendBootstrap
    Write-Host ""
    Write-Host "Frontend command window script:" -ForegroundColor Yellow
    Write-Host $frontendBootstrap
    exit 0
}

Set-Content -Path $backendBootstrapPath -Value $backendBootstrap -Encoding UTF8
Set-Content -Path $frontendBootstrapPath -Value $frontendBootstrap -Encoding UTF8

Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $backendBootstrapPath
)

Write-Host "Waiting $FrontendDelaySeconds seconds before starting the frontend..." -ForegroundColor Cyan
Start-Sleep -Seconds $FrontendDelaySeconds

Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $frontendBootstrapPath
)

Write-Host "Backend and frontend startup windows launched." -ForegroundColor Green
Write-Host "Backend:  http://$BackendHost`:$BackendPort" -ForegroundColor Cyan
Write-Host "Frontend: http://$FrontendHost`:$FrontendPort" -ForegroundColor Cyan

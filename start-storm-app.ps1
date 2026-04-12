param(
    [string]$BackendHost = "127.0.0.1",
    [int]$BackendPort = 8000,
    [string]$FrontendHost = "127.0.0.1",
    [int]$FrontendPort = 5173,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $repoRoot "storm_webapp"
$frontendDir = Join-Path $repoRoot "frontend"
$tempModelCheck = Join-Path $backendDir "_startup_model_check.py"
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
from django.conf import settings
from ml_engine.predictor import get_predictor
import os

print(f"STORM_MODEL_PATH={settings.STORM_MODEL_PATH}")
print(f"MODEL_EXISTS={os.path.exists(settings.STORM_MODEL_PATH)}")
print(f"PREDICTOR_READY={get_predictor() is not None}")
"@

$backendBootstrap = @"
Set-Location '$backendDir'
Write-Host 'Checking Django project...' -ForegroundColor Cyan
& '$venvPython' manage.py check
if (`$LASTEXITCODE -ne 0) { exit `$LASTEXITCODE }
Write-Host 'Verifying prediction model load...' -ForegroundColor Cyan
@'
$modelCheckPython
'@ | Set-Content -Path '$tempModelCheck' -Encoding UTF8
Get-Content '$tempModelCheck' | & '$venvPython' manage.py shell
if (`$LASTEXITCODE -ne 0) { exit `$LASTEXITCODE }
Remove-Item '$tempModelCheck' -ErrorAction SilentlyContinue
Write-Host 'Starting Daphne backend on http://$BackendHost`:$BackendPort' -ForegroundColor Green
& '$venvDaphne' -b $BackendHost -p $BackendPort storm_webapp.asgi:application
"@

$frontendBootstrap = @"
Set-Location '$frontendDir'
Write-Host 'Starting Vite frontend on http://$FrontendHost`:$FrontendPort' -ForegroundColor Green
& '$npmCmd' run dev -- --host $FrontendHost --port $FrontendPort
"@

if ($DryRun) {
    Write-Host "Backend command window script:" -ForegroundColor Yellow
    Write-Host $backendBootstrap
    Write-Host ""
    Write-Host "Frontend command window script:" -ForegroundColor Yellow
    Write-Host $frontendBootstrap
    exit 0
}

Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    $backendBootstrap
)

Start-Sleep -Seconds 2

Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    $frontendBootstrap
)

Write-Host "Backend and frontend startup windows launched." -ForegroundColor Green
Write-Host "Backend:  http://$BackendHost`:$BackendPort" -ForegroundColor Cyan
Write-Host "Frontend: http://$FrontendHost`:$FrontendPort" -ForegroundColor Cyan

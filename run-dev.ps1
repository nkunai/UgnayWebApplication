param(
    [switch]$DryRun,
    [switch]$UseMegaDatasets,
    [switch]$NoRestart,
    [switch]$BackendReload
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $repoRoot "backend"
$frontendDir = Join-Path $repoRoot "frontend"
$backendPython = Join-Path $backendDir ".venv\Scripts\python.exe"
$backendAlembicConfig = Join-Path $backendDir "alembic.ini"
$backendEnv = Join-Path $backendDir ".env"
$frontendEnv = Join-Path $frontendDir ".env.local"
$frontendNodeModules = Join-Path $frontendDir "node_modules"
$frontendDevScript = Join-Path $frontendDir "scripts\dev-clean.mjs"
$megaDatasets = "D:\MEGA\datasets"
$megaArtifacts = "D:\MEGA\artifacts"
$powershellExe = Join-Path $PSHOME "powershell.exe"
$npmCmd = $null

function Quote-PowerShell {
    param([string]$Value)

    return "'" + ($Value -replace "'", "''") + "'"
}

function Require-Path {
    param(
        [string]$Label,
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        $script:missing += "${Label}: $Path"
    }
}

function Get-ListeningPortPids {
    param([int]$Port)

    $matches = netstat -ano | Select-String (":$Port")
    $pids = @()
    foreach ($match in $matches) {
        $parts = ($match.ToString().Trim() -split "\s+")
        if ($parts.Length -ge 5 -and $parts[3] -eq "LISTENING") {
            $pids += [int]$parts[4]
        }
    }
    return $pids | Sort-Object -Unique
}

function Test-HttpReady {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 4
    )

    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec $TimeoutSeconds
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
    } catch {
        return $false
    }
}

function Get-VenvHomePython {
    param([string]$VenvDir)

    $venvConfig = Join-Path $VenvDir "pyvenv.cfg"
    if (-not (Test-Path -LiteralPath $venvConfig)) {
        return $null
    }

    $homeLine = Select-String -Path $venvConfig -Pattern '^\s*home\s*=\s*(.+?)\s*$' | Select-Object -First 1
    if (-not $homeLine) {
        return $null
    }

    return Join-Path $homeLine.Matches[0].Groups[1].Value.Trim() "python.exe"
}

function Get-BackendLaunchConfig {
    param(
        [string]$PythonPath,
        [string]$VenvDir,
        [string]$BackendDir
    )

    $sitePackages = Join-Path $VenvDir "Lib\site-packages"

    if (Test-Path -LiteralPath $PythonPath) {
        try {
            & $PythonPath --version *> $null
            return [pscustomobject]@{
                PythonPath = $PythonPath
                UsesFallback = $false
                SitePackages = $sitePackages
                PythonPathValue = $null
            }
        } catch {
        }
    }

    $fallbackPython = Get-VenvHomePython -VenvDir $VenvDir
    if ($fallbackPython -and (Test-Path -LiteralPath $fallbackPython) -and (Test-Path -LiteralPath $sitePackages)) {
        Write-Warning "Could not verify backend\\.venv\\Scripts\\python.exe directly in this shell. Using pyvenv.cfg fallback validation via $fallbackPython."
        return [pscustomobject]@{
            PythonPath = $fallbackPython
            UsesFallback = $true
            SitePackages = $sitePackages
            PythonPathValue = "$BackendDir;$sitePackages"
        }
    }

    return $null
}

function Stop-ListeningProcesses {
    param(
        [string]$Label,
        [int]$Port,
        [int[]]$Pids
    )

    if (-not $Pids -or $Pids.Count -eq 0) {
        return
    }

    Write-Host "Stopping existing $Label on port $Port (PID(s): $($Pids -join ', '))." -ForegroundColor Yellow
    foreach ($listenerPid in ($Pids | Sort-Object -Unique)) {
        try {
            Stop-Process -Id $listenerPid -Force -ErrorAction Stop
        } catch {
            $script:missing += "Could not stop $Label PID $listenerPid on port ${Port}: $($_.Exception.Message)"
        }
    }
}

function Wait-ForPortRelease {
    param(
        [string]$Label,
        [int]$Port,
        [int]$TimeoutSeconds = 20
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $remaining = Get-ListeningPortPids -Port $Port
        if ($remaining.Count -eq 0) {
            return $true
        }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)

    $remaining = Get-ListeningPortPids -Port $Port
    $script:missing += "$Label port $Port did not close after the restart request. Remaining PID(s): $($remaining -join ', ')."
    return $false
}

$missing = @()
$backendVenvDir = Join-Path $backendDir ".venv"
$backendLaunchConfig = $null

$backendPortPids = Get-ListeningPortPids -Port 8000
$backendAlreadyRunning = $false
$backendNeedsRecovery = $false
if ($backendPortPids.Count -gt 0) {
    if (Test-HttpReady -Url "http://127.0.0.1:8000/api/modules") {
        $backendAlreadyRunning = $true
        Write-Host "Backend already running on http://localhost:8000/api (PID(s): $($backendPortPids -join ', '))." -ForegroundColor Yellow
    } else {
        $backendNeedsRecovery = $true
        Write-Warning "Backend port 8000 is in use by PID(s): $($backendPortPids -join ', '), but the Ugnay API did not respond. This run will recycle that backend process."
    }
}

$frontendPortPids = Get-ListeningPortPids -Port 3000
$frontendAlreadyRunning = $false
$frontendNeedsRecovery = $false
if ($frontendPortPids.Count -gt 0) {
    if (Test-HttpReady -Url "http://127.0.0.1:3000") {
        $frontendAlreadyRunning = $true
        Write-Host "Frontend already running on http://localhost:3000 (PID(s): $($frontendPortPids -join ', '))." -ForegroundColor Yellow
    } else {
        $frontendNeedsRecovery = $true
        Write-Warning "Frontend port 3000 is in use by PID(s): $($frontendPortPids -join ', '), but nothing healthy responded. This run will recycle that frontend process."
    }
}

$needsTargetedRecovery = $backendNeedsRecovery -or $frontendNeedsRecovery
$bothHealthyAndRunning = $backendAlreadyRunning -and $frontendAlreadyRunning

if ($needsTargetedRecovery) {
    $backendShouldRestart = $backendNeedsRecovery -and -not $NoRestart
    $frontendShouldRestart = $frontendNeedsRecovery -and -not $NoRestart
} elseif ($bothHealthyAndRunning) {
    $backendShouldRestart = $backendAlreadyRunning -and -not $NoRestart
    $frontendShouldRestart = $frontendAlreadyRunning -and -not $NoRestart
} else {
    $backendShouldRestart = $false
    $frontendShouldRestart = $false
}

$backendWillStart = (-not $backendAlreadyRunning -and -not $backendNeedsRecovery) -or $backendShouldRestart
$frontendWillStart = (-not $frontendAlreadyRunning -and -not $frontendNeedsRecovery) -or $frontendShouldRestart

if ($backendShouldRestart -or $frontendShouldRestart) {
    Write-Host "Existing Ugnay services detected. This run will relaunch the active ports." -ForegroundColor Yellow
}

if ($backendWillStart) {
    Require-Path -Label "Missing backend env" -Path $backendEnv
    Require-Path -Label "Missing backend virtual environment" -Path $backendPython
    Require-Path -Label "Missing Alembic config" -Path $backendAlembicConfig

    if (Test-Path -LiteralPath $backendPython) {
        $backendLaunchConfig = Get-BackendLaunchConfig -PythonPath $backendPython -VenvDir $backendVenvDir -BackendDir $backendDir
        if (-not $backendLaunchConfig) {
            $missing += "Broken backend virtual environment launcher: $backendPython"
            $missing += "Recreate backend\\.venv on this machine before starting the dev stack, or repair pyvenv.cfg/home Python access."
        }
    }

    if ($UseMegaDatasets -and -not (Test-Path -LiteralPath $megaDatasets)) {
        $missing += "Missing MEGA datasets root: $megaDatasets"
    }
}

if ($frontendWillStart) {
    Require-Path -Label "Missing frontend env" -Path $frontendEnv
    Require-Path -Label "Missing frontend node_modules" -Path $frontendNodeModules
    Require-Path -Label "Missing frontend dev launcher" -Path $frontendDevScript

    try {
        $npmCmd = (Get-Command npm.cmd -ErrorAction Stop).Source
    } catch {
        $missing += "Missing npm.cmd on PATH. Install Node.js or fix PATH before launching the frontend."
    }
}

if ($missing.Count -gt 0) {
    Write-Error ("Cannot start the dev stack because these prerequisites are missing:`n- " + ($missing -join "`n- "))
    exit 1
}

$backendSteps = @(
    '$host.UI.RawUI.WindowTitle = ''Ugnay Backend'''
    'Set-Location -LiteralPath ' + (Quote-PowerShell $backendDir)
    'Write-Host ''Backend API: http://localhost:8000/api'' -ForegroundColor Cyan'
    'Write-Host ''Swagger docs: http://localhost:8000/docs'' -ForegroundColor Cyan'
)

if ($UseMegaDatasets) {
    $backendSteps += '$env:DATASETS_ROOT = ' + (Quote-PowerShell $megaDatasets)
    $backendSteps += '$env:ARTIFACTS_ROOT = ' + (Quote-PowerShell $megaArtifacts)
    $backendSteps += 'Write-Host ''DATASETS_ROOT override: D:\MEGA\datasets'' -ForegroundColor Yellow'
    $backendSteps += 'Write-Host ''ARTIFACTS_ROOT override: D:\MEGA\artifacts'' -ForegroundColor Yellow'
} else {
    $backendSteps += 'Write-Host ''DATASETS_ROOT source: backend\.env'' -ForegroundColor Yellow'
    $backendSteps += 'Write-Host ''ARTIFACTS_ROOT source: backend\.env'' -ForegroundColor Yellow'
}

$backendRuntimePython = $backendPython
if ($backendLaunchConfig -and $backendLaunchConfig.UsesFallback) {
    $backendRuntimePython = $backendLaunchConfig.PythonPath
    $backendSteps += '$env:PYTHONPATH = ' + (Quote-PowerShell $backendLaunchConfig.PythonPathValue)
    $backendSteps += 'Write-Host ''Backend runtime: fallback Python with backend\.venv site-packages'' -ForegroundColor Yellow'
}

$backendSteps += 'Write-Host ''Backend startup uses DATABASE_URL from backend\.env.'' -ForegroundColor Yellow'
$backendSteps += 'Write-Host ''Applying backend database migrations (alembic upgrade head)...'' -ForegroundColor Yellow'
$backendSteps += '& ' + (Quote-PowerShell $backendRuntimePython) + ' -m alembic upgrade head'
$backendSteps += 'if ($LASTEXITCODE -ne 0) { throw ''Backend migration failed. Fix the Alembic/database error above, then retry.'' }'
if ($BackendReload) {
    $backendSteps += 'Write-Host ''Backend reload mode: ON (watch mode).'' -ForegroundColor Yellow'
    $backendSteps += '& ' + (Quote-PowerShell $backendRuntimePython) + ' -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000'
} else {
    $backendSteps += 'Write-Host ''Backend reload mode: OFF (stable startup).'' -ForegroundColor Yellow'
    $backendSteps += '& ' + (Quote-PowerShell $backendRuntimePython) + ' -m uvicorn app.main:app --host 0.0.0.0 --port 8000'
}

$frontendSteps = @(
    '$host.UI.RawUI.WindowTitle = ''Ugnay Frontend'''
    'Set-Location -LiteralPath ' + (Quote-PowerShell $frontendDir)
    'Write-Host ''Frontend app: http://localhost:3000'' -ForegroundColor Cyan'
    'Write-Host ''If port 3000 is busy, Next.js may move to port 3001.'' -ForegroundColor Yellow'
    '& ' + (Quote-PowerShell $npmCmd) + ' run dev'
)

$backendCommand = '& { ' + ($backendSteps -join '; ') + ' }'
$frontendCommand = '& { ' + ($frontendSteps -join '; ') + ' }'

Write-Host "Ready to launch the dev stack." -ForegroundColor Green
Write-Host "Backend:  http://localhost:8000/api"
Write-Host "Frontend: http://localhost:3000"
if ($UseMegaDatasets) {
    Write-Host "Dataset mode: MEGA override enabled ($megaDatasets)"
} else {
    Write-Host "Dataset mode: using backend\\.env"
}

if ($DryRun) {
    Write-Host ""
    Write-Host "Dry run only. Commands were not started." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "[Backend Command]"
    if ($backendShouldRestart) {
        Write-Host "Will restart existing backend on port 8000, then run:"
        Write-Host $backendCommand
    } elseif (-not $backendWillStart) {
        Write-Host "Already running; no new backend window will be started."
    } else {
        Write-Host $backendCommand
    }
    Write-Host ""
    Write-Host "[Frontend Command]"
    if ($frontendShouldRestart) {
        Write-Host "Will restart existing frontend on port 3000, then run:"
        Write-Host $frontendCommand
    } elseif (-not $frontendWillStart) {
        Write-Host "Already running; no new frontend window will be started."
    } else {
        Write-Host $frontendCommand
    }
    exit 0
}

$missing = @()

if ($frontendShouldRestart) {
    Stop-ListeningProcesses -Label "frontend" -Port 3000 -Pids $frontendPortPids
}

if ($backendShouldRestart) {
    Stop-ListeningProcesses -Label "backend" -Port 8000 -Pids $backendPortPids
}

if ($frontendShouldRestart) {
    [void](Wait-ForPortRelease -Label "Frontend" -Port 3000)
}

if ($backendShouldRestart) {
    [void](Wait-ForPortRelease -Label "Backend" -Port 8000)
}

if ($missing.Count -gt 0) {
    Write-Error ("Cannot relaunch the dev stack because these restart steps failed:`n- " + ($missing -join "`n- "))
    exit 1
}

$backendProcess = $null
if ($backendWillStart) {
    $backendProcess = Start-Process -FilePath $powershellExe -ArgumentList @(
        "-NoProfile",
        "-NoExit",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        $backendCommand
    ) -WorkingDirectory $backendDir -PassThru
}

$frontendProcess = $null
if ($frontendWillStart) {
    $frontendProcess = Start-Process -FilePath $powershellExe -ArgumentList @(
        "-NoProfile",
        "-NoExit",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        $frontendCommand
    ) -WorkingDirectory $frontendDir -PassThru
}

Write-Host ""
if ($backendProcess) {
    Write-Host "Started backend window (PID $($backendProcess.Id))."
} elseif ($backendAlreadyRunning) {
    Write-Host "Backend was already running; no new backend window was started."
}

if ($frontendProcess) {
    Write-Host "Started frontend window (PID $($frontendProcess.Id))."
} elseif ($frontendAlreadyRunning) {
    Write-Host "Frontend was already running; no new frontend window was started."
}

if (-not $backendProcess -and -not $frontendProcess) {
    Write-Host "The dev stack is already running." -ForegroundColor Green
    exit 2
}

Write-Host "Close the opened server windows to stop the servers."

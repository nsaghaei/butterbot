param([string]$Release = 'v18')
$ErrorActionPreference = 'Stop'

$appUrl = 'http://127.0.0.1:8790/'
$releaseDirectory = Join-Path $PSScriptRoot ('releases/' + $Release)
$entryFile = Join-Path $releaseDirectory 'server.mjs'
$sharedModules = Join-Path $PSScriptRoot 'node_modules'
$saveFile = Join-Path $PSScriptRoot 'saved/garden-v2.json'
$workspaceRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$logDirectory = Join-Path $workspaceRoot 'work'

function Test-GardenPort {
    $connection = [System.Net.Sockets.TcpClient]::new()
    try {
        $attempt = $connection.ConnectAsync('127.0.0.1', 8790)
        return ($attempt.Wait(350) -and $connection.Connected)
    }
    catch { return $false }
    finally { $connection.Dispose() }
}

$launchMutex = [System.Threading.Mutex]::new($false, 'Local\LayaMakerGardenLaunch8790')
$ownsMutex = $false
try {
    try { $ownsMutex = $launchMutex.WaitOne(0) }
    catch [System.Threading.AbandonedMutexException] { $ownsMutex = $true }
    if (-not $ownsMutex) {
        Write-Output 'Another launch is already in progress. No second server was started.'
        return
    }
    if (Test-GardenPort) {
        Write-Output "Port 8790 is already in use. No second server was started. Existing garden: $appUrl"
        return
    }
    if (-not (Test-Path -LiteralPath $entryFile -PathType Leaf)) {
        throw "The verified release is missing: $entryFile"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $sharedModules 'three/package.json') -PathType Leaf)) {
        throw "Installed application dependencies are missing from $sharedModules"
    }

    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    $nodeExecutable = if ($nodeCommand) { $nodeCommand.Source } else {
        Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
    }
    if (-not (Test-Path -LiteralPath $nodeExecutable -PathType Leaf)) {
        throw 'Node.js was not found on PATH or in the existing Codex runtime.'
    }
    New-Item -ItemType Directory -Force -Path $logDirectory, (Split-Path $saveFile -Parent) | Out-Null
    $standardLog = Join-Path $logDirectory ('maker-' + $Release + '.log')
    $errorLog = Join-Path $logDirectory ('maker-' + $Release + '-error.log')
    $childSettings = @{
        PORT = '8790'
        SAVE_FILE = $saveFile
        SHARED_NODE_MODULES = $sharedModules
    }
    $originalSettings = @{}
    try {
        foreach ($setting in $childSettings.Keys) {
            $originalSettings[$setting] = [Environment]::GetEnvironmentVariable($setting, 'Process')
            [Environment]::SetEnvironmentVariable($setting, $childSettings[$setting], 'Process')
        }
        $serverProcess = Start-Process -FilePath $nodeExecutable -ArgumentList ('"{0}"' -f $entryFile) -WorkingDirectory $releaseDirectory -WindowStyle Hidden -RedirectStandardOutput $standardLog -RedirectStandardError $errorLog -PassThru
    }
    finally {
        foreach ($setting in $childSettings.Keys) {
            [Environment]::SetEnvironmentVariable($setting, $originalSettings[$setting], 'Process')
        }
    }

    for ($attemptNumber = 0; $attemptNumber -lt 40; $attemptNumber++) {
        if ($serverProcess.HasExited) {
            throw "The garden server exited. Read $errorLog"
        }
        if (Test-GardenPort) {
            Write-Output "Garden ready: $appUrl (process $($serverProcess.Id))"
            Write-Output 'Laya on port 8766 and Ollama on port 11435 must already be running.'
            return
        }
        Start-Sleep -Milliseconds 500
    }
    throw "The server has not opened port 8790 yet. Process $($serverProcess.Id) was left running; inspect $standardLog and $errorLog before retrying."
}
finally {
    if ($ownsMutex) { $launchMutex.ReleaseMutex() }
    $launchMutex.Dispose()
}


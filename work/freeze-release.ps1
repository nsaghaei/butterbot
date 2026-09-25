param([string]$Release = 'v5')
$ErrorActionPreference = 'Stop'
$makerRoot = Join-Path $PSScriptRoot '..\outputs\maker'
$releaseRoot = Join-Path $makerRoot ('releases\' + $Release)
if (Test-Path -LiteralPath $releaseRoot) { throw 'Release already exists; do not overwrite a running frozen release.' }
New-Item -ItemType Directory -Force -Path (Join-Path $makerRoot 'evidence') | Out-Null
New-Item -ItemType Directory -Path $releaseRoot | Out-Null
Get-ChildItem -LiteralPath $makerRoot -File | Where-Object { $_.Extension -in '.mjs','.py','.json' } | Copy-Item -Destination $releaseRoot
Copy-Item -LiteralPath (Join-Path $makerRoot 'vendor') -Destination $releaseRoot -Recurse
Copy-Item -LiteralPath (Join-Path $makerRoot 'web-next') -Destination $releaseRoot -Recurse
New-Item -ItemType Directory -Path (Join-Path $releaseRoot 'web') | Out-Null
Copy-Item -LiteralPath (Join-Path $makerRoot 'web\favicon.svg') -Destination (Join-Path $releaseRoot 'web\favicon.svg')
Get-ChildItem -LiteralPath $releaseRoot -Recurse -File | Get-FileHash -Algorithm SHA256 | Select-Object Path,Hash | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $makerRoot ('evidence\release-' + $Release + '-manifest.json'))
Write-Output $releaseRoot

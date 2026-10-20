param(
    [Parameter(Mandatory=$true)][string]$BranchId,
    [string]$InputPath = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'kia-plaza-monthly-cohort.json'),
    [switch]$Apply
)
$ErrorActionPreference = 'Stop'
$taskServer = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskNode = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (Test-Path -LiteralPath 'C:/Program Files/nodejs/node.exe') { $taskNode = 'C:/Program Files/nodejs/node.exe' }
if (-not $taskNode) { throw 'Install Node.js, then rerun this script.' }
if (-not (Test-Path -LiteralPath $InputPath -PathType Leaf)) { throw 'Cohort JSON file not found.' }
$taskArgs = @((Join-Path $PSScriptRoot 'seed-monthly-cohort.cjs'), $InputPath, "--branch-id=$BranchId")
if ($Apply) { $taskArgs += '--apply' }
Push-Location $taskServer
try {
    & $taskNode @taskArgs
    if ($LASTEXITCODE -ne 0) { throw 'Seed stopped. Review the error above; conflicts do not overwrite existing records.' }
} finally { Pop-Location }

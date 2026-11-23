<#
  Builds everything and packs the station setup:  build\HHDC_Station_Setup.zip
  On the store PC: extract, double-click "HHDC Station Setup.exe", paste the key (or copy it on the web first: it is
  filled in by itself), press "Set up this PC". It installs WMDC if missing, HHDC Link to Program Files, saves the key
  for that Windows user, starts the station and shows the handheld being picked up.

    .\make_station_kit.ps1 -Server https://api-host/api          # server pre-filled in the setup window
    .\make_station_kit.ps1 -CertThumbprint <sha1>                 # also sign every exe (cert in the user's store)
    .\make_station_kit.ps1 -NoBuild                               # pack the existing build
#>
param(
    [string]$Server = 'https://danamotors.danagroup.net/api',   # the live API the CPD DEV station uses (2026-11-18)
    [string]$CertThumbprint = '',
    [switch]$NoBuild
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
if (-not $NoBuild) { & (Join-Path $root 'build.ps1') }

$kit = Join-Path $root 'build\station_setup\HHDC Station Setup'
if (Test-Path (Split-Path $kit)) { Remove-Item (Split-Path $kit) -Recurse -Force }
New-Item -ItemType Directory -Force "$kit\payload\wmdc" | Out-Null

Copy-Item (Join-Path $root 'build\setup\HHDC Station Setup.exe') $kit
foreach ($f in 'HhdcLink.exe', 'KMHH.exe') {
    $src = Join-Path $root "build\link\$f"
    if (-not (Test-Path $src)) { throw "build\link\$f is missing (antivirus? exclude hhdc\build and rebuild)." }
    Copy-Item $src "$kit\payload\"
}
$pcSetup = Join-Path $root '..\..\hhdc_integration\pc_setup'
if (-not (Test-Path "$pcSetup\wmupdate.msi")) { throw "WMDC files not found at $pcSetup (wmupdate.msi, Drivers)." }
Copy-Item "$pcSetup\wmupdate.msi" "$kit\payload\wmdc\"
Copy-Item "$pcSetup\Drivers" "$kit\payload\wmdc\Drivers" -Recurse
Set-Content "$kit\setup.ini" "server=$Server" -Encoding ASCII

if ($CertThumbprint) {
    $signtool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match '\\x64\\' } | Sort-Object FullName -Descending | Select-Object -First 1
    if (-not $signtool) { throw 'signtool.exe not found (install the Windows SDK signing tools).' }
    $exes = @("$kit\HHDC Station Setup.exe", "$kit\payload\HhdcLink.exe")   # KMHH.exe runs on Windows CE: left unsigned
    & $signtool.FullName sign /sha1 $CertThumbprint /fd sha256 /tr http://timestamp.digicert.com /td sha256 $exes
    if ($LASTEXITCODE -ne 0) { throw 'Signing failed.' }
}

$commit = (git -C $root log -1 --format='%h %cd' --date=short) 2>$null
$dirty = if ((git -C $root status --porcelain) 2>$null) { ' +changes' } else { '' }
Set-Content "$kit\BUILD.txt" ("hhdc $commit$dirty, packed " + (Get-Date -Format 'yyyy-MM-dd HH:mm')) -Encoding ASCII

$zip = Join-Path $root 'build\HHDC_Station_Setup.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path $kit -DestinationPath $zip
Write-Host ''
Write-Host "Setup: $zip" -ForegroundColor Green
Write-Host (Get-Content "$kit\BUILD.txt")
Write-Host 'On the store PC: extract, double-click "HHDC Station Setup.exe".'

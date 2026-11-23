<#
  Builds the handheld integration with the free C# compiler only (no Visual Studio, no dotnet SDK):

    build\device\KMHH.exe              Kia Motors Handheld, the device app (.NET Compact Framework 3.5; also runs on a PC)
    build\link\HhdcLink.exe            the PC tool (.NET Framework 4.8, 32-bit for WMDC's rapi.dll)
    build\link\HhdcLinkCli.exe         the same logic on a command line (scripting and end-to-end tests)
    build\tests\HhdcTests.exe          unit tests; run after building unless -SkipTests

  The device app is compiled against the device's own .NET CF 3.5 libraries, which are not in this
  repository. They are in dana_projects\hhdc_integration\tools\probe\refs, two levels above this folder (the CF libraries copied from
  the device and renamed mscorlib.dll, System.dll ...). Pass -CfRefs if they are elsewhere.

  The compiler is csc.exe from .NET Framework 4 (C# 5): no ?. operator, no $"" strings, no nameof.
#>
param(
    [string]$CfRefs = (Join-Path $PSScriptRoot '..\..\hhdc_integration\tools\probe\refs'),
    [switch]$SkipTests,
    [switch]$DeviceOnly,
    [switch]$UiTest
)
$ErrorActionPreference = 'Stop'
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { throw "csc.exe not found at $csc (install .NET Framework 4.x)." }
$out = Join-Path $PSScriptRoot 'build'
New-Item -ItemType Directory -Force "$out\device", "$out\link", "$out\tests" | Out-Null

function Sources([string[]]$dirs) {
    $dirs | ForEach-Object { Get-ChildItem (Join-Path $PSScriptRoot $_) -Filter *.cs -Recurse } | ForEach-Object { $_.FullName }
}
function Compile([string]$name, [string[]]$arguments) {
    Write-Host "== $name"
    & $csc @arguments /nologo /warn:4
    if ($LASTEXITCODE -ne 0) { throw "$name failed to compile." }
}

# Device app: only the device's own libraries, so any API the Compact Framework lacks is a compile error.
$refs = Resolve-Path $CfRefs -ErrorAction SilentlyContinue
if (-not $refs) { throw "CF reference libraries not found at $CfRefs. Pass -CfRefs <folder with mscorlib.dll, System.dll, System.Drawing.dll, System.Windows.Forms.dll>." }
$cf = @('mscorlib', 'System', 'System.Drawing', 'System.Windows.Forms') | ForEach-Object { "/r:$refs\$_.dll" }
$icon = Join-Path $PSScriptRoot 'res\kmhh.ico'
# CE 6 cannot read PNG icon images: the handheld gets a bitmap-only copy (res\make_ce_icon.py builds it).
$ceIcon = Join-Path $PSScriptRoot 'res\kmhh-ce.ico'
# Guard: every image in the device icon must be a bitmap (a PNG image starts with 0x89 'PNG'); CE 6 shows a blank icon otherwise.
$ico = [IO.File]::ReadAllBytes($ceIcon)
for ($i = 0; $i -lt [BitConverter]::ToUInt16($ico, 4); $i++) {
    $at = [BitConverter]::ToInt32($ico, 6 + 16 * $i + 12)
    if ($ico[$at] -eq 0x89 -and $ico[$at + 1] -eq 0x50) { throw "res\kmhh-ce.ico holds a PNG image; the handheld (CE 6) cannot show it. Run python res\make_ce_icon.py." }
}
$logo = Join-Path $PSScriptRoot 'res\kia-logo.png'
# Every exe carries version information (publisher, product, version) and every PC exe a manifest (asInvoker): an
# exe with neither looks like malware to heuristic antivirus (Avast "IDP.Generic" removed them, 2026-11-18). Signing
# is the real cure: make_station_kit.ps1 -CertThumbprint.
$manifest = Join-Path $PSScriptRoot 'res\app.manifest'
$version = (Get-Date).ToString('yyyy.M.d.HHmm')
New-Item -ItemType Directory -Force "$out\obj" | Out-Null
function VersionInfo([string]$name, [string]$title) {
    $file = "$out\obj\$name.AssemblyInfo.cs"
    Set-Content $file -Encoding ASCII -Value @"
[assembly: System.Reflection.AssemblyTitle("$title")]
[assembly: System.Reflection.AssemblyDescription("$title")]
[assembly: System.Reflection.AssemblyCompany("Dana Motors")]
[assembly: System.Reflection.AssemblyProduct("Kia Motors Handheld")]
[assembly: System.Reflection.AssemblyCopyright("Dana Motors")]
[assembly: System.Reflection.AssemblyVersion("$version")]
"@
    return $file
}

Compile 'Kia Motors Handheld (device)' (@('/noconfig', '/nostdlib', '/target:winexe', "/out:$out\device\KMHH.exe", "/win32icon:$ceIcon", "/resource:$logo,Kia.Logo.png", (VersionInfo 'KMHH' 'Kia Motors Handheld')) + $cf + (Sources 'shared', 'device\src'))
if ($DeviceOnly) { return }

# PC tool and its command-line twin (shared logic in link\src\Core).
$fw = @('System.dll', 'System.Core.dll', 'System.Drawing.dll', 'System.Windows.Forms.dll', 'System.Web.Extensions.dll', 'System.Security.dll') | ForEach-Object { "/r:$_" }
Compile 'HHDC Link' (@('/platform:x86', '/target:winexe', "/out:$out\link\HhdcLink.exe", "/win32icon:$icon", "/win32manifest:$manifest", (VersionInfo 'HhdcLink' 'HHDC Link (handheld station)')) + $fw + (Sources 'shared', 'link\src'))
# The CLI is a test and scripting aid; antivirus often locks or quarantines a freshly built copy. Do not fail the build for that.
try { Compile 'HHDC Link CLI' (@('/platform:x86', '/target:exe', "/out:$out\link\HhdcLinkCli.exe", "/win32manifest:$manifest", (VersionInfo 'HhdcLinkCli' 'HHDC Link command line')) + $fw + (Sources 'shared', 'link\src\Core', 'link\cli')) }
catch { Write-Warning 'HHDC Link CLI was not rebuilt (antivirus holding the old file? exclude hhdc\build). Continuing.' }
# Station setup: one window that installs WMDC and HHDC Link and registers the station (make_station_kit.ps1 packs it).
New-Item -ItemType Directory -Force "$out\setup" | Out-Null
Compile 'Station setup' (@('/platform:anycpu', '/target:winexe', "/out:$out\setup\HHDC Station Setup.exe", "/win32icon:$icon", "/win32manifest:$manifest", (VersionInfo 'StationSetup' 'Kia Motors Handheld station setup'), '/r:System.ServiceProcess.dll') + $fw + (Sources 'shared', 'link\src\Core', 'setup\src'))

Copy-Item "$out\device\KMHH.exe" "$out\link\KMHH.exe" -Force   # HHDC Link installs this on the device

# Tests: shared + device core (no forms) + link core, against the desktop framework.
Compile 'Unit tests' (@('/platform:x86', '/target:exe', "/out:$out\tests\HhdcTests.exe") + $fw + (Sources 'shared', 'device\src\Core', 'link\src\Core', 'tests'))
if (-not $SkipTests) {
    Write-Host '== Running tests'
    & "$out\tests\HhdcTests.exe"
    if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }
}
if ($UiTest) {
    # Drives the real device exe through a counting session on this PC (off screen, no keyboard focus needed).
    Compile 'UI test driver' (@('/platform:x86', '/target:exe', "/out:$out\tests\UiDriver.exe") + $fw + (Sources 'shared', 'uitest'))
    $data = Join-Path $out 'ui-test-data'
    if (Test-Path $data) { Remove-Item $data -Recurse -Force }
    Write-Host '== UI test'
    & "$out\tests\UiDriver.exe" "$out\device\KMHH.exe" $data "$out\ui-shots" --sample
    if ($LASTEXITCODE -ne 0) { throw 'UI test failed.' }
    # Second session: the scan modes, Find and the bin guard, on a fresh data folder.
    $dataScan = Join-Path $out 'ui-test-data-scan'
    if (Test-Path $dataScan) { Remove-Item $dataScan -Recurse -Force }
    Write-Host '== UI test (scan modes)'
    & "$out\tests\UiDriver.exe" "$out\device\KMHH.exe" $dataScan "$out\ui-shots-scan" --sample --scan
    if ($LASTEXITCODE -ne 0) { throw 'UI test (scan modes) failed.' }
    # Third session: picking an indent on the document screen.
    $dataDoc = Join-Path $out 'ui-test-data-doc'
    if (Test-Path $dataDoc) { Remove-Item $dataDoc -Recurse -Force }
    Write-Host '== UI test (picking document)'
    & "$out\tests\UiDriver.exe" "$out\device\KMHH.exe" $dataDoc "$out\ui-shots-doc" --doc
    if ($LASTEXITCODE -ne 0) { throw 'UI test (picking document) failed.' }
}
Write-Host "Built into $out"

<#
  Builds the handheld integration with the free C# compiler only (no Visual Studio, no dotnet SDK):

    build\device\DanamotorsCount.exe   the device app (.NET Compact Framework 3.5; also runs on a PC)
    build\link\HhdcLink.exe            the PC tool (.NET Framework 4.8, 32-bit for WMDC's rapi.dll)
    build\link\HhdcLinkCli.exe         the same logic on a command line (scripting and end-to-end tests)
    build\tests\HhdcTests.exe          unit tests; run after building unless -SkipTests

  The device app is compiled against the device's own .NET CF 3.5 libraries, which are not in this
  repository. They are in dana_projects\hhdc_integration\tools\probe\refs (the CF libraries copied from
  the device and renamed mscorlib.dll, System.dll ...). Pass -CfRefs if they are elsewhere.

  The compiler is csc.exe from .NET Framework 4 (C# 5): no ?. operator, no $"" strings, no nameof.
#>
param(
    [string]$CfRefs = (Join-Path $PSScriptRoot '..\hhdc_integration\tools\probe\refs'),
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
Compile 'Danamotors Count (device)' (@('/noconfig', '/nostdlib', '/target:winexe', "/out:$out\device\DanamotorsCount.exe") + $cf + (Sources 'shared', 'device\src'))
if ($DeviceOnly) { return }

# PC tool and its command-line twin (shared logic in link\src\Core).
$fw = @('System.dll', 'System.Core.dll', 'System.Drawing.dll', 'System.Windows.Forms.dll', 'System.Web.Extensions.dll', 'System.Security.dll') | ForEach-Object { "/r:$_" }
Compile 'HHDC Link' (@('/platform:x86', '/target:winexe', "/out:$out\link\HhdcLink.exe") + $fw + (Sources 'shared', 'link\src'))
# The CLI is a test and scripting aid; antivirus often locks or quarantines a freshly built copy. Do not fail the build for that.
try { Compile 'HHDC Link CLI' (@('/platform:x86', '/target:exe', "/out:$out\link\HhdcLinkCli.exe") + $fw + (Sources 'shared', 'link\src\Core', 'link\cli')) }
catch { Write-Warning 'HHDC Link CLI was not rebuilt (antivirus holding the old file? exclude hhdc\build). Continuing.' }

Copy-Item "$out\device\DanamotorsCount.exe" "$out\link\DanamotorsCount.exe" -Force   # HHDC Link installs this on the device

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
    & "$out\tests\UiDriver.exe" "$out\device\DanamotorsCount.exe" $data "$out\ui-shots" --sample
    if ($LASTEXITCODE -ne 0) { throw 'UI test failed.' }
    # Second session: the scan modes, Find and the bin guard, on a fresh data folder.
    $dataScan = Join-Path $out 'ui-test-data-scan'
    if (Test-Path $dataScan) { Remove-Item $dataScan -Recurse -Force }
    Write-Host '== UI test (scan modes)'
    & "$out\tests\UiDriver.exe" "$out\device\DanamotorsCount.exe" $dataScan "$out\ui-shots-scan" --sample --scan
    if ($LASTEXITCODE -ne 0) { throw 'UI test (scan modes) failed.' }
    # Third session: picking an indent on the document screen.
    $dataDoc = Join-Path $out 'ui-test-data-doc'
    if (Test-Path $dataDoc) { Remove-Item $dataDoc -Recurse -Force }
    Write-Host '== UI test (picking document)'
    & "$out\tests\UiDriver.exe" "$out\device\DanamotorsCount.exe" $dataDoc "$out\ui-shots-doc" --doc
    if ($LASTEXITCODE -ne 0) { throw 'UI test (picking document) failed.' }
}
Write-Host "Built into $out"

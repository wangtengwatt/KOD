[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$RepositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$CorePath = Join-Path $PSScriptRoot 'kod-dev-launcher-core.ps1'

if (-not (Test-Path -LiteralPath $CorePath -PathType Leaf)) {
  throw "Launcher core does not exist: $CorePath"
}

. $CorePath

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw "ASSERT TRUE FAILED: $Message" }
}

function Assert-False([bool]$Condition, [string]$Message) {
  if ($Condition) { throw "ASSERT FALSE FAILED: $Message" }
}

function Assert-Equal($Expected, $Actual, [string]$Message) {
  if ($Expected -ne $Actual) {
    throw "ASSERT EQUAL FAILED: $Message`nExpected: $Expected`nActual:   $Actual"
  }
}

function New-FakeCommand([string]$Path, [string[]]$Lines) {
  $directory = Split-Path -Parent $Path
  [void](New-Item -ItemType Directory -Path $directory -Force)
  Set-Content -LiteralPath $Path -Value $Lines -Encoding ASCII
}

function Add-DependencySentinels([string]$ProjectRoot) {
  $sentinels = @(
    'node_modules\electron\dist\electron.exe',
    'node_modules\.bin\electron-vite.cmd',
    'node_modules\.bin\cross-env.cmd',
    'node_modules\.modules.yaml'
  )
  foreach ($relativePath in $sentinels) {
    $path = Join-Path $ProjectRoot $relativePath
    [void](New-Item -ItemType Directory -Path (Split-Path -Parent $path) -Force)
    Set-Content -LiteralPath $path -Value 'fixture' -Encoding ASCII
  }
}

$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) "kod-launcher-test-$([Guid]::NewGuid().ToString('N'))"
[void](New-Item -ItemType Directory -Path $temporaryRoot -Force)

try {
  Assert-True (Test-KodVersionInRange -VersionText 'v22.12.0' -MinimumVersion '22.12.0' -MaximumExclusiveVersion '25.0.0') 'minimum Node version is accepted'
  Assert-True (Test-KodVersionInRange -VersionText 'v22.23.2' -MinimumVersion '22.12.0' -MaximumExclusiveVersion '25.0.0') 'installed Node 22 is accepted'
  Assert-False (Test-KodVersionInRange -VersionText 'v22.11.9' -MinimumVersion '22.12.0' -MaximumExclusiveVersion '25.0.0') 'Node below minimum is rejected'
  Assert-False (Test-KodVersionInRange -VersionText 'v25.0.0' -MinimumVersion '22.12.0' -MaximumExclusiveVersion '25.0.0') 'exclusive maximum is rejected'
  Assert-False (Test-KodVersionInRange -VersionText 'not-a-version' -MinimumVersion '22.12.0' -MaximumExclusiveVersion '25.0.0') 'malformed version is rejected'

  $nodeDirectory = Join-Path $temporaryRoot 'node'
  $nodeCommand = Join-Path $nodeDirectory 'node.cmd'
  New-FakeCommand $nodeCommand @('@echo off', 'echo v22.23.2')
  $resolvedNode = Resolve-KodNodeCommand -CandidatePaths @($nodeCommand) -MinimumVersion '22.12.0' -MaximumExclusiveVersion '25.0.0'
  Assert-Equal $nodeCommand $resolvedNode.FilePath 'supported Node candidate is selected'
  Assert-Equal '22.23.2' $resolvedNode.Version 'selected Node version is normalized'

  $pnpmScript = Join-Path $nodeDirectory 'pnpm.ps1'
  $pnpmCommand = Join-Path $nodeDirectory 'pnpm.cmd'
  New-FakeCommand $pnpmScript @("throw 'pnpm.ps1 must never execute'")
  New-FakeCommand $pnpmCommand @('@echo off', 'echo 10.33.0')
  $resolvedPnpm = Resolve-KodPnpmCommand -NodeDirectory $nodeDirectory -CandidatePaths @($pnpmScript, $pnpmCommand) -MinimumVersion '10.17.0'
  Assert-Equal $pnpmCommand $resolvedPnpm.FilePath 'pnpm.cmd is selected instead of pnpm.ps1'
  Assert-Equal 0 $resolvedPnpm.PrefixArguments.Count 'direct pnpm command has no prefix arguments'
  Assert-Equal '10.33.0' $resolvedPnpm.Version 'pnpm version is normalized'

  $corepackDirectory = Join-Path $temporaryRoot 'corepack'
  $corepackCommand = Join-Path $corepackDirectory 'corepack.cmd'
  New-FakeCommand $corepackCommand @('@echo off', 'if "%1"=="pnpm" if "%2"=="--version" echo 10.33.0')
  $resolvedCorepack = Resolve-KodPnpmCommand -NodeDirectory $corepackDirectory -CandidatePaths @($corepackCommand) -MinimumVersion '10.17.0'
  Assert-Equal $corepackCommand $resolvedCorepack.FilePath 'corepack fallback is selected'
  Assert-Equal 'pnpm' $resolvedCorepack.PrefixArguments[0] 'corepack invokes pnpm subcommand'

  $selectedNodeDirectory = Join-Path $temporaryRoot 'selected-node'
  $selectedNodeCorepack = Join-Path $selectedNodeDirectory 'corepack.cmd'
  New-FakeCommand $selectedNodeCorepack @('@echo off', 'if "%1"=="pnpm" if "%2"=="--version" echo 10.33.0')
  $foreignNodeDirectory = Join-Path $temporaryRoot 'foreign-node'
  $foreignPnpm = Join-Path $foreignNodeDirectory 'pnpm.cmd'
  New-FakeCommand $foreignPnpm @('@echo off', 'echo 10.33.0')
  $runtimeMatchedPnpm = Resolve-KodPnpmCommand -NodeDirectory $selectedNodeDirectory -CandidatePaths @($foreignPnpm) -MinimumVersion '10.17.0'
  Assert-Equal $selectedNodeCorepack $runtimeMatchedPnpm.FilePath 'pnpm runner stays with the selected Node runtime'
  Assert-Equal 'pnpm' $runtimeMatchedPnpm.PrefixArguments[0] 'selected Node corepack takes priority over foreign pnpm.cmd'

  $warningCommand = Join-Path $temporaryRoot 'warning-command.cmd'
  New-FakeCommand $warningCommand @('@echo off', 'echo non-fatal warning 1>&2', 'echo ready', 'exit /b 0')
  $warningLines = [System.Collections.Generic.List[string]]::new()
  $warningExitCode = Invoke-KodExternalCommand -FilePath $warningCommand -Arguments @() -OutputAction {
    param([string]$Line)
    $warningLines.Add($Line)
  }
  Assert-Equal 0 $warningExitCode 'stderr warning does not become a launcher failure when command exits zero'
  Assert-True (($warningLines -join "`n") -match 'non-fatal warning') 'stderr warning is retained for diagnostics'
  Assert-True (($warningLines -join "`n") -match 'ready') 'stdout remains available after stderr warning'

  $ownedProjectRoot = 'D:\watt\kod'
  Assert-True (Test-KodProjectPath -Text 'D:\watt\kod\node_modules\electron\dist\electron.exe' -ProjectRoot $ownedProjectRoot) 'a process below the project root is owned by KOD'
  Assert-True (Test-KodProjectPath -Text 'd:/WATT/KOD/node_modules/electron/dist/electron.exe' -ProjectRoot $ownedProjectRoot) 'project matching is case-insensitive and separator-safe'
  Assert-False (Test-KodProjectPath -Text 'D:\watt\kod-ai-portal\backend\target\kod-portal-backend.jar' -ProjectRoot $ownedProjectRoot) 'backend sibling with the same prefix is never treated as a KOD client process'
  Assert-False (Test-KodProjectPath -Text 'D:\watt\kod-android\gradlew.bat' -ProjectRoot $ownedProjectRoot) 'mobile sibling with the same prefix is never treated as a KOD client process'

  $healthAttempts = [System.Collections.Generic.List[string]]::new()
  $healthRequest = {
    param([string]$Uri)
    $healthAttempts.Add($Uri)
    if ($Uri -eq 'http://[::1]:1212/') { return 200 }
    throw 'loopback endpoint unavailable'
  }
  Assert-True (Test-KodRendererHealthy -Uris @('http://127.0.0.1:1212/', 'http://[::1]:1212/') -RequestAction $healthRequest) 'renderer health succeeds when either loopback address is available'
  Assert-Equal 2 $healthAttempts.Count 'health probing advances to IPv6 after IPv4 fails'
  Assert-False (Test-KodRendererHealthy -Uris @('http://127.0.0.1:1212/') -RequestAction { throw 'offline' }) 'renderer health fails when all loopback addresses fail'

  $projectRoot = Join-Path $temporaryRoot 'project-success'
  [void](New-Item -ItemType Directory -Path $projectRoot -Force)
  Set-Content -LiteralPath (Join-Path $projectRoot 'pnpm-lock.yaml') -Value 'lockfileVersion: 9.0' -Encoding ASCII
  $installCalls = [System.Collections.Generic.List[string]]::new()
  $installAction = {
    param($Command, [string[]]$Arguments)
    $installCalls.Add(($Arguments -join ' '))
    Add-DependencySentinels $projectRoot
    return 0
  }
  $installResult = Ensure-KodDependencies -ProjectRoot $projectRoot -PnpmCommand $resolvedPnpm -InstallAction $installAction
  Assert-True $installResult.Installed 'missing dependencies trigger installation'
  Assert-Equal 1 $installCalls.Count 'installation runs exactly once'
  Assert-Equal 'install --frozen-lockfile' $installCalls[0] 'installation preserves the lockfile'
  Assert-Equal 0 $installResult.MissingAfter.Count 'all sentinels are revalidated after installation'

  $secondResult = Ensure-KodDependencies -ProjectRoot $projectRoot -PnpmCommand $resolvedPnpm -InstallAction $installAction
  Assert-False $secondResult.Installed 'complete dependencies skip installation'
  Assert-Equal 1 $installCalls.Count 'complete dependencies do not invoke pnpm again'

  $failedProjectRoot = Join-Path $temporaryRoot 'project-failure'
  [void](New-Item -ItemType Directory -Path $failedProjectRoot -Force)
  Set-Content -LiteralPath (Join-Path $failedProjectRoot 'pnpm-lock.yaml') -Value 'lockfileVersion: 9.0' -Encoding ASCII
  $failureMessage = $null
  try {
    [void](Ensure-KodDependencies -ProjectRoot $failedProjectRoot -PnpmCommand $resolvedPnpm -InstallAction { return 37 })
  } catch {
    $failureMessage = $_.Exception.Message
  }
  Assert-True (-not [string]::IsNullOrWhiteSpace($failureMessage)) 'failed installation stops dependency bootstrap'
  Assert-True ($failureMessage -match '37') 'failed installation reports the exit code'
  Assert-True ($failureMessage -match 'electron\\dist\\electron.exe') 'failed installation reports missing dependency sentinel'

  Write-Host 'KOD launcher core tests passed.' -ForegroundColor Green
} finally {
  if (Test-Path -LiteralPath $temporaryRoot) {
    Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
  }
}

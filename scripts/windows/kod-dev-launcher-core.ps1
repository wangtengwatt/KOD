Set-StrictMode -Version Latest

function ConvertTo-KodVersion([string]$VersionText) {
  if ([string]::IsNullOrWhiteSpace($VersionText)) { return $null }
  $normalized = $VersionText.Trim()
  if ($normalized.StartsWith('v', [StringComparison]::OrdinalIgnoreCase)) {
    $normalized = $normalized.Substring(1)
  }
  if ($normalized -notmatch '^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$') { return $null }
  return [Version]::new([int]$Matches[1], [int]$Matches[2], [int]$Matches[3])
}

function Test-KodVersionInRange(
  [string]$VersionText,
  [string]$MinimumVersion,
  [string]$MaximumExclusiveVersion
) {
  $version = ConvertTo-KodVersion $VersionText
  $minimum = ConvertTo-KodVersion $MinimumVersion
  $maximum = ConvertTo-KodVersion $MaximumExclusiveVersion
  if ($null -eq $version -or $null -eq $minimum -or $null -eq $maximum) { return $false }
  return $version -ge $minimum -and $version -lt $maximum
}

function Invoke-KodVersionCommand([string]$FilePath, [string[]]$PrefixArguments = @()) {
  try {
    $output = @(& $FilePath @PrefixArguments '--version' 2>$null)
    if ($LASTEXITCODE -ne 0 -or $output.Count -eq 0) { return $null }
    return [string]$output[0]
  } catch {
    return $null
  }
}

function Invoke-KodExternalCommand(
  [string]$FilePath,
  [string[]]$Arguments,
  [scriptblock]$OutputAction
) {
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & $FilePath @Arguments 2>&1 | ForEach-Object {
      $line = if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.Exception.Message } else { [string]$_ }
      if ($null -ne $OutputAction) { & $OutputAction $line }
    }
    if ($null -eq $LASTEXITCODE) { return 1 }
    return [int]$LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
}

function Test-KodProjectPath([string]$Text, [string]$ProjectRoot) {
  if ([string]::IsNullOrWhiteSpace($Text) -or [string]::IsNullOrWhiteSpace($ProjectRoot)) { return $false }
  $normalizedText = $Text.Replace('/', '\')
  $normalizedRoot = ([System.IO.Path]::GetFullPath($ProjectRoot)).TrimEnd('\').Replace('/', '\')
  $searchStart = 0
  while ($searchStart -lt $normalizedText.Length) {
    $index = $normalizedText.IndexOf($normalizedRoot, $searchStart, [StringComparison]::OrdinalIgnoreCase)
    if ($index -lt 0) { return $false }
    $boundaryIndex = $index + $normalizedRoot.Length
    if ($boundaryIndex -eq $normalizedText.Length) { return $true }
    $boundary = $normalizedText[$boundaryIndex]
    if ($boundary -eq '\' -or [char]::IsWhiteSpace($boundary) -or $boundary -eq '"' -or $boundary -eq "'") { return $true }
    $searchStart = $index + 1
  }
  return $false
}

function Test-KodRendererHealthy([string[]]$Uris, [scriptblock]$RequestAction = $null) {
  if ($null -eq $RequestAction) {
    $RequestAction = {
      param([string]$Uri)
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 2
      return [int]$response.StatusCode
    }
  }
  foreach ($uri in $Uris) {
    if ([string]::IsNullOrWhiteSpace($uri)) { continue }
    try {
      $statusCode = [int](& $RequestAction $uri)
      if ($statusCode -ge 200 -and $statusCode -lt 500) { return $true }
    } catch {
      continue
    }
  }
  return $false
}

function Resolve-KodNodeCommand(
  [string[]]$CandidatePaths,
  [string]$MinimumVersion,
  [string]$MaximumExclusiveVersion
) {
  $checked = [System.Collections.Generic.List[string]]::new()
  foreach ($candidatePath in ($CandidatePaths | Select-Object -Unique)) {
    if ([string]::IsNullOrWhiteSpace($candidatePath)) { continue }
    $checked.Add($candidatePath)
    if (-not (Test-Path -LiteralPath $candidatePath -PathType Leaf)) { continue }
    $versionText = Invoke-KodVersionCommand -FilePath $candidatePath
    if (-not (Test-KodVersionInRange -VersionText $versionText -MinimumVersion $MinimumVersion -MaximumExclusiveVersion $MaximumExclusiveVersion)) { continue }
    $version = ConvertTo-KodVersion $versionText
    return [pscustomobject]@{
      FilePath = [System.IO.Path]::GetFullPath($candidatePath)
      Version = $version.ToString(3)
    }
  }
  $locations = if ($checked.Count -gt 0) { $checked -join ', ' } else { '(none)' }
  throw "未找到符合要求的 Node。项目要求 >=$MinimumVersion <$MaximumExclusiveVersion；已检查：$locations"
}

function Resolve-KodPnpmCommand(
  [string]$NodeDirectory,
  [string[]]$CandidatePaths,
  [string]$MinimumVersion
) {
  $candidates = [System.Collections.Generic.List[object]]::new()
  $localPnpm = Join-Path $NodeDirectory 'pnpm.cmd'
  $localCorepack = Join-Path $NodeDirectory 'corepack.cmd'
  $candidates.Add([pscustomobject]@{ FilePath = $localPnpm; PrefixArguments = @() })
  $candidates.Add([pscustomobject]@{ FilePath = $localCorepack; PrefixArguments = @('pnpm') })
  foreach ($candidatePath in $CandidatePaths) {
    if ([string]::IsNullOrWhiteSpace($candidatePath)) { continue }
    $leafName = [System.IO.Path]::GetFileName($candidatePath)
    if ($leafName.Equals('pnpm.cmd', [StringComparison]::OrdinalIgnoreCase)) {
      $candidates.Add([pscustomobject]@{ FilePath = $candidatePath; PrefixArguments = @() })
    } elseif ($leafName.Equals('corepack.cmd', [StringComparison]::OrdinalIgnoreCase)) {
      $candidates.Add([pscustomobject]@{ FilePath = $candidatePath; PrefixArguments = @('pnpm') })
    }
  }

  $checked = [System.Collections.Generic.List[string]]::new()
  $seen = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($candidate in $candidates) {
    $identity = "$($candidate.FilePath)|$($candidate.PrefixArguments -join ' ')"
    if (-not $seen.Add($identity)) { continue }
    $checked.Add($identity)
    if (-not (Test-Path -LiteralPath $candidate.FilePath -PathType Leaf)) { continue }
    $versionText = Invoke-KodVersionCommand -FilePath $candidate.FilePath -PrefixArguments $candidate.PrefixArguments
    $version = ConvertTo-KodVersion $versionText
    $minimum = ConvertTo-KodVersion $MinimumVersion
    if ($null -eq $version -or $null -eq $minimum -or $version -lt $minimum) { continue }
    return [pscustomobject]@{
      FilePath = [System.IO.Path]::GetFullPath($candidate.FilePath)
      PrefixArguments = [string[]]$candidate.PrefixArguments
      Version = $version.ToString(3)
    }
  }
  $locations = if ($checked.Count -gt 0) { $checked -join ', ' } else { '(none)' }
  throw "未找到符合要求的 pnpm.cmd 或 corepack.cmd pnpm。项目要求 pnpm >=$MinimumVersion；已检查：$locations"
}

function Get-KodDependencySentinels {
  return @(
    'node_modules\electron\dist\electron.exe',
    'node_modules\.bin\electron-vite.cmd',
    'node_modules\.bin\cross-env.cmd',
    'node_modules\.modules.yaml'
  )
}

function Get-KodMissingDependencies([string]$ProjectRoot) {
  return @(
    Get-KodDependencySentinels | Where-Object {
      -not (Test-Path -LiteralPath (Join-Path $ProjectRoot $_) -PathType Leaf)
    }
  )
}

function Ensure-KodDependencies(
  [string]$ProjectRoot,
  $PnpmCommand,
  [scriptblock]$InstallAction
) {
  $missingBefore = @(Get-KodMissingDependencies $ProjectRoot)
  if ($missingBefore.Count -eq 0) {
    return [pscustomobject]@{ Installed = $false; MissingBefore = @(); MissingAfter = @() }
  }

  $lockfilePath = Join-Path $ProjectRoot 'pnpm-lock.yaml'
  if (-not (Test-Path -LiteralPath $lockfilePath -PathType Leaf)) {
    throw "依赖不完整且缺少锁文件：$lockfilePath"
  }
  if ($null -eq $InstallAction) {
    throw '依赖不完整，但未提供 pnpm 安装执行器。'
  }

  $exitCode = & $InstallAction $PnpmCommand ([string[]]@('install', '--frozen-lockfile'))
  $missingAfter = @(Get-KodMissingDependencies $ProjectRoot)
  if ([int]$exitCode -ne 0 -or $missingAfter.Count -gt 0) {
    $missingText = if ($missingAfter.Count -gt 0) { $missingAfter -join ', ' } else { '(none)' }
    throw "pnpm install --frozen-lockfile 失败，退出码=$exitCode；仍缺少：$missingText"
  }

  return [pscustomobject]@{
    Installed = $true
    MissingBefore = $missingBefore
    MissingAfter = $missingAfter
  }
}

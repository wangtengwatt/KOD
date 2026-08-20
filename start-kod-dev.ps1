# KOD 蒜粒 — 一键启动开发模式
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProjectRoot = [System.IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
$RendererPort = 1212
$HealthUris = @("http://127.0.0.1:$RendererPort/", "http://[::1]:$RendererPort/", "http://localhost:$RendererPort/")
$StartupGraceSeconds = 45
$LogPath = Join-Path $ProjectRoot '.kod-dev-launcher.log'
$PackagePath = Join-Path $ProjectRoot 'package.json'
$ElectronPath = Join-Path $ProjectRoot 'node_modules\electron\dist\electron.exe'
$LauncherCorePath = Join-Path $ProjectRoot 'scripts\windows\kod-dev-launcher-core.ps1'
$env:ELECTRON_RUN_AS_NODE = $null

if (-not (Test-Path -LiteralPath $LauncherCorePath -PathType Leaf)) {
  throw "启动器核心不存在：$LauncherCorePath"
}
. $LauncherCorePath

function Write-LauncherLog([string]$Message, [ConsoleColor]$Color = [ConsoleColor]::Gray) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
  Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
  Write-Host $Message -ForegroundColor $Color
}

function Wait-OnFailure([string]$Message, [int]$ExitCode = 1) {
  Write-LauncherLog $Message Red
  Write-Host "日志：$LogPath" -ForegroundColor Yellow
  Write-Host '启动失败。按 Enter 关闭此窗口。' -ForegroundColor Yellow
  [void](Read-Host)
  exit $ExitCode
}

function Test-RendererHealthy {
  return Test-KodRendererHealthy -Uris $HealthUris
}

function Test-ProjectPath([string]$Text) {
  return Test-KodProjectPath -Text $Text -ProjectRoot $ProjectRoot
}

function Test-KodDevMarker([string]$CommandLine) {
  if ([string]::IsNullOrWhiteSpace($CommandLine)) { return $false }
  return $CommandLine -match '(?i)(pnpm(?:\.cmd)?\s+(?:run\s+)?dev(?:\s|$)|electron-vite(?:\.cmd|\.js)?\s+dev(?:\s|$)|node_modules[\\/]electron[\\/]dist[\\/]electron\.exe)'
}

function Test-ProjectOwnedProcess($Process) {
  return (Test-ProjectPath ([string]$Process.CommandLine)) -or (Test-ProjectPath ([string]$Process.ExecutablePath))
}

function Get-KodDevProcesses([object[]]$Snapshot) {
  $roots = @($Snapshot | Where-Object { (Test-ProjectOwnedProcess $_) -and (Test-KodDevMarker ([string]$_.CommandLine)) })
  $ids = [System.Collections.Generic.HashSet[int]]::new()
  $queue = [System.Collections.Generic.Queue[int]]::new()
  foreach ($process in $roots) {
    if ($ids.Add([int]$process.ProcessId)) { $queue.Enqueue([int]$process.ProcessId) }
  }
  while ($queue.Count -gt 0) {
    $parentId = $queue.Dequeue()
    foreach ($child in ($Snapshot | Where-Object { [int]$_.ParentProcessId -eq $parentId })) {
      if ((Test-ProjectOwnedProcess $child) -and $ids.Add([int]$child.ProcessId)) { $queue.Enqueue([int]$child.ProcessId) }
    }
  }
  return @($Snapshot | Where-Object { $ids.Contains([int]$_.ProcessId) })
}

function Wait-ForRenderer([int]$TimeoutSeconds) {
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  do {
    if (Test-RendererHealthy) { return $true }
    Start-Sleep -Milliseconds 750
  } while ([DateTime]::UtcNow -lt $deadline)
  return $false
}

function Request-ExistingWindowFocus {
  if (-not (Test-Path -LiteralPath $ElectronPath -PathType Leaf)) { throw "Electron executable was not found: $ElectronPath" }
  Write-LauncherLog '检测到健康的 KOD 开发实例，正在聚焦已有窗口...' Cyan
  $focusProcess = Start-Process -FilePath $ElectronPath -ArgumentList '.' -WorkingDirectory $ProjectRoot -PassThru -WindowStyle Hidden
  if (-not $focusProcess.WaitForExit(10000)) {
    Write-LauncherLog "聚焦通知进程未及时退出，PID=$($focusProcess.Id)；不启动第二套服务。" Yellow
    return
  }
  Write-LauncherLog "聚焦通知已发送，退出码=$($focusProcess.ExitCode)。" Green
}

function Confirm-KodRestart([object[]]$Processes) {
  try {
    Add-Type -AssemblyName System.Windows.Forms
    $message = 'KOD 开发实例疑似无响应。检测到项目开发进程，但 renderer 未就绪。是否重启？未保存内容可能丢失。'
    $result = [System.Windows.Forms.MessageBox]::Show($message, 'KOD 开发实例疑似卡死', [System.Windows.Forms.MessageBoxButtons]::OKCancel, [System.Windows.Forms.MessageBoxIcon]::Warning, [System.Windows.Forms.MessageBoxDefaultButton]::Button1)
    return $result -eq [System.Windows.Forms.DialogResult]::OK
  } catch {
    Write-LauncherLog "无法显示重启确认框，已安全取消：$($_.Exception.Message)" Red
    return $false
  }
}

function Stop-KodDevProcesses([object[]]$Processes) {
  $selected = @($Processes | Sort-Object ProcessId -Unique)
  foreach ($process in $selected) { Write-LauncherLog "准备结束 PID=$($process.ProcessId), Parent=$($process.ParentProcessId), Name=$($process.Name), Command=$($process.CommandLine)" Yellow }
  foreach ($process in ($selected | Sort-Object ProcessId -Descending)) {
    try { Stop-Process -Id ([int]$process.ProcessId) -ErrorAction Stop } catch { Write-LauncherLog "PID=$($process.ProcessId) 无法正常结束：$($_.Exception.Message)" Yellow }
  }
  $deadline = [DateTime]::UtcNow.AddSeconds(5)
  do {
    $remaining = @($selected | Where-Object { Get-Process -Id ([int]$_.ProcessId) -ErrorAction SilentlyContinue })
    if ($remaining.Count -eq 0) { return }
    Start-Sleep -Milliseconds 500
  } while ([DateTime]::UtcNow -lt $deadline)
  foreach ($process in $remaining) {
    try { Stop-Process -Id ([int]$process.ProcessId) -Force -ErrorAction Stop; Write-LauncherLog "已强制结束验证过的 PID=$($process.ProcessId)。" Yellow } catch { Write-LauncherLog "无法强制结束 PID=$($process.ProcessId)：$($_.Exception.Message)" Red }
  }
}

function Invoke-KodPnpm($PnpmCommand, [string[]]$Arguments) {
  $commandArguments = [string[]]@($PnpmCommand.PrefixArguments) + $Arguments
  return Invoke-KodExternalCommand -FilePath $PnpmCommand.FilePath -Arguments $commandArguments -OutputAction {
    param([string]$line)
    Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
    Write-Host $line
  }
}

function Invoke-KodDevelopment($PnpmCommand) {
  $env:NODE_OPTIONS = '--max-old-space-size=4096'
  $env:DEV_PORT = "$RendererPort"
  return Invoke-KodPnpm -PnpmCommand $PnpmCommand -Arguments @('dev')
}

try {
  if (-not (Test-Path -LiteralPath $PackagePath -PathType Leaf)) { Wait-OnFailure "KOD 项目不存在：$ProjectRoot" }
  $package = Get-Content -LiteralPath $PackagePath -Raw | ConvertFrom-Json
  if (-not $package.scripts.dev) { Wait-OnFailure "package.json 缺少 dev 脚本：$PackagePath" }

  $nodeCandidates = [System.Collections.Generic.List[string]]::new()
  $nodeCandidates.Add((Join-Path $ProjectRoot '.tools\node\node.exe'))
  $nodeCandidates.Add((Join-Path $ProjectRoot '.node\node.exe'))
  $nodeCandidates.Add('C:\Program Files\nodejs\node.exe')
  $pathNode = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($null -ne $pathNode) { $nodeCandidates.Add($pathNode.Source) }
  try {
    $nodeCommand = Resolve-KodNodeCommand -CandidatePaths $nodeCandidates.ToArray() -MinimumVersion '22.12.0' -MaximumExclusiveVersion '25.0.0'
  } catch {
    Wait-OnFailure $_.Exception.Message
  }
  $nodeDirectory = Split-Path -Parent $nodeCommand.FilePath
  $env:Path = "$nodeDirectory;$env:Path"

  $pnpmCandidates = [System.Collections.Generic.List[string]]::new()
  $pathPnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
  if ($null -ne $pathPnpm) { $pnpmCandidates.Add($pathPnpm.Source) }
  $pathCorepack = Get-Command corepack.cmd -ErrorAction SilentlyContinue
  if ($null -ne $pathCorepack) { $pnpmCandidates.Add($pathCorepack.Source) }
  try {
    $pnpmCommand = Resolve-KodPnpmCommand -NodeDirectory $nodeDirectory -CandidatePaths $pnpmCandidates.ToArray() -MinimumVersion '10.17.0'
  } catch {
    Wait-OnFailure $_.Exception.Message
  }
  Write-LauncherLog "工具链：Node $($nodeCommand.Version) [$($nodeCommand.FilePath)]；pnpm $($pnpmCommand.Version) [$($pnpmCommand.FilePath)]。" Cyan

  Set-Location -LiteralPath $ProjectRoot
  $pathBytes = [Text.Encoding]::UTF8.GetBytes($ProjectRoot.ToLowerInvariant())
  $sha256 = [Security.Cryptography.SHA256]::Create()
  try { $pathHash = ([BitConverter]::ToString($sha256.ComputeHash($pathBytes))).Replace('-', '').Substring(0, 16) } finally { $sha256.Dispose() }

  $mutex = [Threading.Mutex]::new($false, "Local\KodDevLauncher-$pathHash")
  $hasMutex = $false
  try {
    $hasMutex = $mutex.WaitOne(0)
    if (-not $hasMutex) { Write-LauncherLog '另一个 KOD 启动器正在检查或启动项目，请稍后再试。' Yellow; exit 0 }

    $missingDependencies = @(Get-KodMissingDependencies $ProjectRoot)
    if ($missingDependencies.Count -gt 0) {
      Write-LauncherLog "检测到依赖不完整，准备执行 pnpm install --frozen-lockfile。缺少：$($missingDependencies -join ', ')" Yellow
    }
    try {
      $dependencyResult = Ensure-KodDependencies -ProjectRoot $ProjectRoot -PnpmCommand $pnpmCommand -InstallAction {
        param($Command, [string[]]$Arguments)
        return Invoke-KodPnpm -PnpmCommand $Command -Arguments $Arguments
      }
    } catch {
      Wait-OnFailure $_.Exception.Message
    }
    if ($dependencyResult.Installed) {
      Write-LauncherLog '项目依赖已按 pnpm-lock.yaml 恢复完成。' Green
    } else {
      Write-LauncherLog '项目依赖检查通过，无需重新安装。' Green
    }

    $existing = @(Get-KodDevProcesses (Get-CimInstance Win32_Process))
    if ($existing.Count -gt 0) {
      if (Wait-ForRenderer 8) { Request-ExistingWindowFocus; exit 0 }
      Write-LauncherLog "发现 $($existing.Count) 个项目开发进程，renderer 尚未就绪；继续等待启动宽限期。" Yellow
      if (Wait-ForRenderer $StartupGraceSeconds) { Request-ExistingWindowFocus; exit 0 }
      $existing = @(Get-KodDevProcesses (Get-CimInstance Win32_Process))
      if ($existing.Count -gt 0) {
        if (-not (Confirm-KodRestart $existing)) { Write-LauncherLog '用户取消重启，现有进程保持不变。' Yellow; exit 2 }
        Write-LauncherLog '用户确认重启；仅结束已验证属于当前项目的开发进程。' Yellow
        Stop-KodDevProcesses $existing
        Start-Sleep -Seconds 2
      }
    }

    $exitCode = Invoke-KodDevelopment -PnpmCommand $pnpmCommand
    if ($exitCode -ne 0) { Wait-OnFailure "KOD 开发进程已退出，退出码=$exitCode。" $exitCode }
    Write-LauncherLog 'KOD 开发进程已正常退出。' Green
    exit 0
  } finally {
    if ($hasMutex) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
  }
} catch {
  try { Write-LauncherLog "启动器异常：$($_.Exception.Message)" Red } catch { Write-Host "启动器异常：$($_.Exception.Message)" -ForegroundColor Red }
  Write-Host "日志：$LogPath" -ForegroundColor Yellow
  Write-Host '按 Enter 关闭此窗口。' -ForegroundColor Yellow
  [void](Read-Host)
  exit 1
}

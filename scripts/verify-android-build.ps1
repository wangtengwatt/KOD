[CmdletBinding()]
param(
    [ValidateSet('localtest', 'production')]
    [string]$Environment = 'localtest',
    [string]$ApkPath,
    [string]$AaptPath
)

$ErrorActionPreference = 'Stop'

function Resolve-AaptPath {
    param([string]$RequestedPath)

    if ($RequestedPath) {
        return (Resolve-Path -LiteralPath $RequestedPath).Path
    }

    $command = Get-Command aapt -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $sdkCandidates = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT)
    if ($env:LOCALAPPDATA) {
        $sdkCandidates += (Join-Path $env:LOCALAPPDATA 'Android\Sdk')
    }
    foreach ($sdkRoot in ($sdkCandidates | Where-Object { $_ } | Select-Object -Unique)) {
        $buildTools = Join-Path $sdkRoot 'build-tools'
        if (-not (Test-Path -LiteralPath $buildTools -PathType Container)) {
            continue
        }
        $aapt = Get-ChildItem -LiteralPath $buildTools -Directory |
            Sort-Object { [version]($_.Name -replace '[^0-9.]', '') } -Descending |
            ForEach-Object { Join-Path $_.FullName 'aapt.exe' } |
            Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
            Select-Object -First 1
        if ($aapt) {
            return $aapt
        }
    }

    throw 'Android aapt.exe was not found. Set ANDROID_HOME/ANDROID_SDK_ROOT or pass -AaptPath.'
}

function Read-ApkJsonEntry {
    param(
        [System.IO.Compression.ZipArchive]$Archive,
        [string]$EntryName
    )

    $entry = $Archive.GetEntry($EntryName)
    if (-not $entry) {
        throw "APK is missing required environment entry: $EntryName"
    }
    $reader = [System.IO.StreamReader]::new($entry.Open())
    try {
        return ($reader.ReadToEnd() | ConvertFrom-Json)
    }
    finally {
        $reader.Dispose()
    }
}

if (-not $ApkPath) {
    $variantDirectory = if ($Environment -eq 'localtest') { 'debug' } else { 'release' }
    $variantFile = if ($Environment -eq 'localtest') { 'app-debug.apk' } else { 'app-release.apk' }
    $ApkPath = Join-Path $PSScriptRoot "..\android\app\build\outputs\apk\$variantDirectory\$variantFile"
}

$resolvedApkPath = (Resolve-Path -LiteralPath $ApkPath).Path
$resolvedAaptPath = Resolve-AaptPath -RequestedPath $AaptPath
$badging = (& $resolvedAaptPath dump badging $resolvedApkPath 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) {
    throw "aapt could not inspect APK '$resolvedApkPath': $badging"
}

$packageMatch = [regex]::Match($badging, "package:\s+name='([^']+)'\s+versionCode='([^']+)'\s+versionName='([^']+)'")
if (-not $packageMatch.Success) {
    throw "aapt output did not contain package identity: $badging"
}

$actualPackage = $packageMatch.Groups[1].Value
$versionCode = $packageMatch.Groups[2].Value
$versionName = $packageMatch.Groups[3].Value
$expectedPackage = if ($Environment -eq 'localtest') { 'com.kod.app.localtest' } else { 'com.kod.app' }
$expectedVersionSuffix = if ($Environment -eq 'localtest') { '-localtest' } else { '' }

if ($actualPackage -ne $expectedPackage) {
    throw "$Environment APK package mismatch: expected $expectedPackage, received $actualPackage"
}
if ($expectedVersionSuffix -and -not $versionName.EndsWith($expectedVersionSuffix)) {
    throw "localtest APK version must end with '$expectedVersionSuffix': $versionName"
}
if (-not $expectedVersionSuffix -and $versionName.EndsWith('-localtest')) {
    throw "production APK version must not use the localtest suffix: $versionName"
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($resolvedApkPath)
try {
    $marker = Read-ApkJsonEntry -Archive $archive -EntryName 'assets/kod-build-environment.json'
    $capacitor = Read-ApkJsonEntry -Archive $archive -EntryName 'assets/capacitor.config.json'
}
finally {
    $archive.Dispose()
}

$expectedUrl = if ($Environment -eq 'localtest') { 'http://10.0.2.2:8080' } else { $null }
$expectedScheme = if ($Environment -eq 'localtest') { 'http' } else { 'https' }
$expectedCleartext = $Environment -eq 'localtest'
$expectedMixedContent = $Environment -eq 'localtest'

if ($marker.environment -ne $Environment -or $marker.appId -ne $expectedPackage) {
    throw "$Environment APK marker mismatch: environment=$($marker.environment), appId=$($marker.appId)"
}
if ($capacitor.appId -ne $expectedPackage) {
    throw "$Environment APK Capacitor appId mismatch: expected $expectedPackage, received $($capacitor.appId)"
}
if ($capacitor.server.androidScheme -ne $expectedScheme) {
    throw "$Environment APK endpoint scheme mismatch: expected $expectedScheme, received $($capacitor.server.androidScheme)"
}
if ([bool]$capacitor.server.cleartext -ne $expectedCleartext -or [bool]$capacitor.android.allowMixedContent -ne $expectedMixedContent) {
    throw "$Environment APK transport policy does not match the synchronized environment"
}
$actualUrl = $capacitor.server.url
if ($Environment -eq 'localtest' -and $actualUrl -ne $expectedUrl) {
    throw "localtest APK endpoint mismatch: expected $expectedUrl, received $actualUrl"
}
if ($Environment -eq 'production' -and $actualUrl) {
    throw "production APK must not contain a Capacitor server URL: $actualUrl"
}

$sha256 = (Get-FileHash -LiteralPath $resolvedApkPath -Algorithm SHA256).Hash
Write-Output "APK path: $resolvedApkPath"
Write-Output "Package: $actualPackage"
Write-Output "Version: $versionName (code $versionCode)"
Write-Output "Environment: $Environment"
Write-Output "SHA256: $sha256"

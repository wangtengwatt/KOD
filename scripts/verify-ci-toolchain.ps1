[CmdletBinding()]
param(
    [string]$NodeVersion,
    [string]$JavaVersion,
    [string]$SdkRoot
)

$ErrorActionPreference = 'Stop'

if (-not $NodeVersion) {
    $NodeVersion = (& node --version 2>&1 | Out-String).Trim().TrimStart('v')
    if ($LASTEXITCODE -ne 0) {
        throw 'Node.js could not be executed on the CI runner'
    }
}
if ($NodeVersion -notmatch '^22(?:\.|$)') {
    throw "Node.js 22 required; received $NodeVersion"
}

if (-not $JavaVersion) {
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $javaOutput = (& java -version 2>&1 | Out-String)
    $javaExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorActionPreference
    if ($javaExitCode -ne 0) {
        throw "Java could not be executed on the CI runner: $javaOutput"
    }
    $javaMatch = [regex]::Match($javaOutput, '(?:version\s+)?["'']?(\d+(?:\.\d+)+)')
    if (-not $javaMatch.Success) {
        throw "Unable to parse Java version: $javaOutput"
    }
    $JavaVersion = $javaMatch.Groups[1].Value
}
if ($JavaVersion -notmatch '^21(?:\.|$)') {
    throw "Java 21 required; received $JavaVersion"
}

if (-not $SdkRoot) {
    $SdkRoot = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { $env:ANDROID_SDK_ROOT }
}
if (-not $SdkRoot) {
    throw 'Android SDK root missing; set ANDROID_HOME or ANDROID_SDK_ROOT'
}
$resolvedSdkRoot = [System.IO.Path]::GetFullPath($SdkRoot)
$platform = Join-Path $resolvedSdkRoot 'platforms\android-35'
$buildTools = Join-Path $resolvedSdkRoot 'build-tools\35.0.0'
if (-not (Test-Path -LiteralPath $platform -PathType Container)) {
    throw "Android SDK platform missing: android-35 under $resolvedSdkRoot"
}
if (-not (Test-Path -LiteralPath $buildTools -PathType Container)) {
    throw "Android SDK build-tools missing: 35.0.0 under $resolvedSdkRoot"
}

Write-Output "Node.js $NodeVersion"
Write-Output "Java $JavaVersion"
Write-Output 'Android platform android-35'
Write-Output 'Android build-tools 35.0.0'

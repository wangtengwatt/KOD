[CmdletBinding()]
param(
    [ValidateSet('localtest', 'production')]
    [string]$Environment = 'localtest',
    [string]$ApkPath,
    [string]$AaptPath,
    [string]$OutputsRoot
)

$ErrorActionPreference = 'Stop'
if (-not $OutputsRoot) {
    $OutputsRoot = Join-Path $PSScriptRoot '..\android\app\build\outputs\apk'
}

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

function Resolve-AndroidApkPath {
    param(
        [string]$RequestedEnvironment,
        [string]$RequestedOutputsRoot
    )

    $variant = if ($RequestedEnvironment -eq 'localtest') { 'debug' } else { 'release' }
    $variantRoot = [System.IO.Path]::GetFullPath((Join-Path $RequestedOutputsRoot $variant))
    if (-not (Test-Path -LiteralPath $variantRoot -PathType Container)) {
        throw "Android $variant output directory does not exist: $variantRoot"
    }

    $metadataPath = Join-Path $variantRoot 'output-metadata.json'
    if (Test-Path -LiteralPath $metadataPath -PathType Leaf) {
        $metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
        if ($metadata.variantName -and $metadata.variantName -ne $variant) {
            throw "Android output metadata variant mismatch: expected $variant, received $($metadata.variantName)"
        }
        $elements = @($metadata.elements)
        if ($elements.Count -ne 1) {
            throw "Android output metadata must identify exactly one APK; multiple outputs are ambiguous (found $($elements.Count))"
        }
        $outputFile = [string]$elements[0].outputFile
        if (-not $outputFile -or [System.IO.Path]::IsPathRooted($outputFile)) {
            throw 'Android output metadata contains an invalid or rooted APK path'
        }
        $candidate = [System.IO.Path]::GetFullPath((Join-Path $variantRoot $outputFile))
        $variantPrefix = $variantRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
        if (-not $candidate.StartsWith($variantPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Android output metadata APK path escapes the variant directory: $outputFile"
        }
        if ([System.IO.Path]::GetExtension($candidate) -ne '.apk' -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            throw "Android output metadata APK does not exist: $candidate"
        }
        return $candidate
    }

    $fallbacks = @(Get-ChildItem -LiteralPath $variantRoot -File -Filter '*.apk')
    if ($fallbacks.Count -ne 1) {
        throw "Android $variant output requires output-metadata.json or exactly one APK; found $($fallbacks.Count)"
    }
    return $fallbacks[0].FullName
}

function Copy-ApkRendererEntries {
    param(
        [System.IO.Compression.ZipArchive]$Archive,
        [string]$Destination
    )

    $entries = @($Archive.Entries | Where-Object {
        $_.FullName.StartsWith('assets/public/', [System.StringComparison]::Ordinal) -and
        -not $_.FullName.EndsWith('/', [System.StringComparison]::Ordinal)
    })
    if ($entries.Count -eq 0) {
        throw 'APK does not contain renderer assets under assets/public/'
    }

    $destinationRoot = [System.IO.Path]::GetFullPath($Destination)
    $destinationPrefix = $destinationRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    foreach ($entry in $entries) {
        $relative = $entry.FullName.Substring('assets/public/'.Length).Replace('/', [System.IO.Path]::DirectorySeparatorChar)
        $target = [System.IO.Path]::GetFullPath((Join-Path $destinationRoot $relative))
        if (-not $target.StartsWith($destinationPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "APK renderer entry escapes assets/public: $($entry.FullName)"
        }
        $parent = [System.IO.Path]::GetDirectoryName($target)
        if ($parent) {
            New-Item -ItemType Directory -Path $parent -Force | Out-Null
        }
        $input = $entry.Open()
        $output = [System.IO.File]::Create($target)
        try {
            $input.CopyTo($output)
        }
        finally {
            $output.Dispose()
            $input.Dispose()
        }
    }
}

if (-not $ApkPath) {
    $ApkPath = Resolve-AndroidApkPath -RequestedEnvironment $Environment -RequestedOutputsRoot $OutputsRoot
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
$labelMatch = [regex]::Match($badging, "(?m)^application-label:'([^']+)'\s*$")
if (-not $labelMatch.Success) {
    throw "aapt output did not contain application-label: $badging"
}
$applicationLabel = $labelMatch.Groups[1].Value
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
$rendererDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "kod-apk-renderer-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $rendererDirectory | Out-Null
try {
    $archive = [System.IO.Compression.ZipFile]::OpenRead($resolvedApkPath)
    try {
        $marker = Read-ApkJsonEntry -Archive $archive -EntryName 'assets/kod-build-environment.json'
        $capacitor = Read-ApkJsonEntry -Archive $archive -EntryName 'assets/capacitor.config.json'
        Copy-ApkRendererEntries -Archive $archive -Destination $rendererDirectory
    }
    finally {
        $archive.Dispose()
    }

    $expectedScheme = if ($Environment -eq 'localtest') { 'http' } else { 'https' }
    $expectedCleartext = $Environment -eq 'localtest'
    $expectedMixedContent = $Environment -eq 'localtest'

    if ($marker.environment -ne $Environment -or $marker.appId -ne $expectedPackage) {
        throw "$Environment APK marker mismatch: environment=$($marker.environment), appId=$($marker.appId)"
    }
    if ($applicationLabel -ne $marker.displayName -or $applicationLabel -ne $capacitor.appName) {
        throw "$Environment APK application-label mismatch: aapt=$applicationLabel, marker=$($marker.displayName), Capacitor=$($capacitor.appName)"
    }
    if (-not $applicationLabel.StartsWith('KOD', [System.StringComparison]::Ordinal) -or
        ($applicationLabel.Length -gt 3 -and -not [char]::IsWhiteSpace($applicationLabel[3]))) {
        throw "$Environment APK identity must use uppercase KOD"
    }
    if ($Environment -eq 'production' -and $applicationLabel -ne 'KOD') {
        throw "production APK application-label must be exactly KOD"
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
    if ($capacitor.server.PSObject.Properties.Name -contains 'url') {
        throw "$Environment APK must not contain a Capacitor server URL; service origin is verified from bundled renderer assets"
    }

    $nodeBinary = if ($env:KOD_NODE_BINARY) { $env:KOD_NODE_BINARY } else { (Get-Command node).Source }
    $endpointVerifier = Join-Path $PSScriptRoot 'verify-production-endpoints.ts'
    $endpointOutput = (& $nodeBinary --no-warnings --experimental-strip-types $endpointVerifier --expect-kod-origin $Environment $rendererDirectory 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) {
        throw "$Environment APK renderer endpoint verification failed: $endpointOutput"
    }

    $sha256 = (Get-FileHash -LiteralPath $resolvedApkPath -Algorithm SHA256).Hash
    Write-Output "APK path: $resolvedApkPath"
    Write-Output "Package: $actualPackage"
    Write-Output "Version: $versionName (code $versionCode)"
    Write-Output "Environment: $Environment"
    Write-Output "Application label: $applicationLabel"
    Write-Output "SHA256: $sha256"
}
finally {
    Remove-Item -LiteralPath $rendererDirectory -Recurse -Force -ErrorAction SilentlyContinue
}

param(
  [string]$SigningDirectory = 'D:\watt\.kod-signing',
  [string]$BackupDirectory = [Environment]::GetFolderPath('Desktop')
)

$ErrorActionPreference = 'Stop'
$signingRoot = [IO.Path]::GetFullPath($SigningDirectory)
$expectedRoot = [IO.Path]::GetFullPath('D:\watt\.kod-signing')
if ($signingRoot -ne $expectedRoot) {
  throw "Signing directory must resolve to $expectedRoot"
}

$keyStorePath = Join-Path $signingRoot 'kod-release.jks'
$propertiesPath = Join-Path $signingRoot 'signing.properties'
$recoveryCodePath = Join-Path $signingRoot 'backup-recovery-code.txt'
$plainArchivePath = Join-Path $signingRoot 'KOD-Android-signing-backup.zip'
$encryptedArchivePath = Join-Path $signingRoot 'KOD-Android-signing-backup.zip.enc'
$desktopBackupPath = Join-Path ([IO.Path]::GetFullPath($BackupDirectory)) 'KOD-Android-signing-backup.zip.enc'

if (Test-Path -LiteralPath $keyStorePath) {
  throw "Signing key already exists at $keyStorePath; refusing to overwrite it."
}

New-Item -ItemType Directory -Path $signingRoot -Force | Out-Null

function New-HexSecret([int]$Bytes) {
  $buffer = New-Object byte[] $Bytes
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($buffer) } finally { $generator.Dispose() }
  return ([BitConverter]::ToString($buffer)).Replace('-', '').ToLowerInvariant()
}

$keyPassword = New-HexSecret 24
$backupPassword = New-HexSecret 24
$keytoolPath = 'C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe'
$opensslPath = 'C:\Program Files\Git\usr\bin\openssl.exe'
if (!(Test-Path -LiteralPath $keytoolPath)) { throw 'Android Studio keytool was not found.' }
if (!(Test-Path -LiteralPath $opensslPath)) { throw 'Git for Windows OpenSSL was not found.' }

& $keytoolPath -genkeypair -v -keystore $keyStorePath -storepass $keyPassword -keypass $keyPassword -alias kod-release -keyalg RSA -keysize 4096 -validity 10000 -dname 'CN=KOD, OU=Mobile, O=KAI, L=Singapore, C=SG'
if ($LASTEXITCODE -ne 0) { throw 'keytool failed.' }

$portableStorePath = $keyStorePath.Replace('\', '/')
$properties = "storeFile=$portableStorePath`nstorePassword=$keyPassword`nkeyAlias=kod-release`nkeyPassword=$keyPassword`n"
[IO.File]::WriteAllText($propertiesPath, $properties, [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText($recoveryCodePath, $backupPassword, [Text.UTF8Encoding]::new($false))

$readmePath = Join-Path $signingRoot 'RESTORE-README.txt'
$readme = @"
KOD Android signing backup

1. Decrypt KOD-Android-signing-backup.zip.enc with OpenSSL AES-256-CBC, PBKDF2 and 200000 iterations.
2. The recovery password is stored separately in D:\watt\.kod-signing\backup-recovery-code.txt on the original computer.
3. Restore kod-release.jks and signing.properties into D:\watt\.kod-signing on the build computer.
4. Never commit either file to Git.
"@
[IO.File]::WriteAllText($readmePath, $readme, [Text.UTF8Encoding]::new($false))

Compress-Archive -LiteralPath $keyStorePath, $propertiesPath, $readmePath -DestinationPath $plainArchivePath -Force
& $opensslPath enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -in $plainArchivePath -out $encryptedArchivePath -pass "file:$recoveryCodePath"
if ($LASTEXITCODE -ne 0) { throw 'OpenSSL backup encryption failed.' }
Copy-Item -LiteralPath $encryptedArchivePath -Destination $desktopBackupPath -Force

$resolvedPlainArchive = [IO.Path]::GetFullPath($plainArchivePath)
if (!$resolvedPlainArchive.StartsWith($expectedRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Refusing to remove an archive outside the signing directory.'
}
Remove-Item -LiteralPath $plainArchivePath -Force
Remove-Item -LiteralPath $readmePath -Force

Write-Output "Signing key created: $keyStorePath"
Write-Output "Encrypted backup copied to: $desktopBackupPath"
Write-Output "Recovery code kept separately at: $recoveryCodePath"

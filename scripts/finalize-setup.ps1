#Requires -Version 5.1
param([string] $Version = '0.4.0', [switch] $Nightly)
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$source = Join-Path $root 'installer\setup\src-tauri\target\release\Rinari-Setup.exe'
# La Nightly sale aparte: nunca se confunde con un instalador de la normal.
$output = Join-Path $root $(if ($Nightly) { 'release\nightly' } else { 'release\installer' })
if (-not (Test-Path -LiteralPath $source)) { throw "Setup executable missing: $source" }
New-Item -ItemType Directory -Force -Path $output | Out-Null
$name = if ($Nightly) { "Rinari-Agent-Nightly-Setup-$Version-x64.exe" } else { "Rinari-Agent-Setup-$Version-x64.exe" }
$destination = Join-Path $output $name
Copy-Item -LiteralPath $source -Destination $destination -Force
$stream = [System.IO.File]::OpenRead($destination)
try {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { $hash = ([System.BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
  finally { $sha.Dispose() }
} finally { $stream.Dispose() }
$utf8 = New-Object System.Text.UTF8Encoding($false)
$metadata = [ordered]@{ file = [System.IO.Path]::GetFileName($destination); version = $Version; architecture = 'x64'; signed = $false; sha256 = $hash; bytes = (Get-Item -LiteralPath $destination).Length }
[System.IO.File]::WriteAllText((Join-Path $output 'setup.sha256.json'), ($metadata | ConvertTo-Json), $utf8)
Write-Host "Unsigned review setup: $destination"
Write-Host "SHA-256: $hash"

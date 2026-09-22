#Requires -Version 5.1
param([string] $Version = '0.2.0')
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$source = Join-Path $root 'installer\setup\src-tauri\target\release\Rinari-Setup.exe'
$output = Join-Path $root 'release\installer'
if (-not (Test-Path -LiteralPath $source)) { throw "Setup executable missing: $source" }
New-Item -ItemType Directory -Force -Path $output | Out-Null
$destination = Join-Path $output "Rinari-Agent-Setup-$Version-x64.exe"
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

#Requires -Version 5.1
param(
  [string] $SourceDir = (Join-Path $PSScriptRoot '..\release\electron\win-unpacked'),
  [string] $OutputDir = (Join-Path $PSScriptRoot '..\installer\setup\src-tauri\resources\payload'),
  [string] $Version = '0.2.0'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$source = [System.IO.Path]::GetFullPath($SourceDir)
$output = [System.IO.Path]::GetFullPath($OutputDir)
$allowedSource = [System.IO.Path]::GetFullPath((Join-Path $repo 'release\electron\win-unpacked'))
$allowedOutput = [System.IO.Path]::GetFullPath((Join-Path $repo 'installer\setup\src-tauri\resources\payload'))
if ($source -ne $allowedSource -or $output -ne $allowedOutput) {
  throw 'Payload paths must remain inside the fixed package staging locations.'
}
if (-not (Test-Path -LiteralPath (Join-Path $source 'rinari-agent.exe'))) {
  throw "Packaged application missing at $source"
}
if (-not (Test-Path -LiteralPath (Join-Path $source 'resources\engine-dist\python.exe'))) {
  throw 'The self-contained Engine is missing from the packaged application.'
}

$stage = Join-Path $output 'stage'
$archive = Join-Path $output 'Rinari-Agent-Payload.zip'
if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null
Get-ChildItem -LiteralPath $source -Force | Copy-Item -Destination $stage -Recurse -Force

function Get-Sha256([string] $Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return ([System.BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
  } finally { $stream.Dispose() }
}

function Get-RelativePayloadPath([string] $Base, [string] $Path) {
  $separator = [System.IO.Path]::DirectorySeparatorChar
  $baseUri = New-Object System.Uri(($Base.TrimEnd($separator) + $separator))
  $pathUri = New-Object System.Uri($Path)
  return [System.Uri]::UnescapeDataString($baseUri.MakeRelativeUri($pathUri).ToString()).Replace('\', '/')
}

$files = [ordered]@{}
Get-ChildItem -LiteralPath $stage -Recurse -File | Sort-Object FullName | ForEach-Object {
  $relative = Get-RelativePayloadPath $stage $_.FullName
  $files[$relative] = [ordered]@{
    sha256 = Get-Sha256 $_.FullName
    size = $_.Length
  }
}
$manifest = [ordered]@{
  schema = 1
  product = 'Rinari Agent'
  app_id = 'com.rinari.agent'
  version = $Version
  architecture = 'x64'
  files = $files
}
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $stage 'payload-manifest.json'), ($manifest | ConvertTo-Json -Depth 6), $utf8)

[System.IO.Compression.ZipFile]::CreateFromDirectory(
  $stage,
  $archive,
  [System.IO.Compression.CompressionLevel]::Optimal,
  $false
)
$hash = Get-Sha256 $archive
@{
  file = 'Rinari-Agent-Payload.zip'
  sha256 = $hash
  bytes = (Get-Item -LiteralPath $archive).Length
  version = $Version
} | ConvertTo-Json | ForEach-Object { [System.IO.File]::WriteAllText((Join-Path $output 'payload.sha256.json'), $_, $utf8) }
Remove-Item -LiteralPath $stage -Recurse -Force
Write-Host "Payload: $archive"
Write-Host "SHA-256: $hash"

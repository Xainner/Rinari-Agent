#Requires -Version 5.1
param(
  [string] $SourceDir = (Join-Path $PSScriptRoot '..\build\installer\source'),
  [string] $OutDir = (Join-Path $PSScriptRoot '..\installer\setup\public\assets')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function New-Canvas([int] $Width, [int] $Height) {
  [System.Drawing.Bitmap]::new($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
}

function Draw-Cover($Graphics, $Image, [int] $Width, [int] $Height) {
  $scale = [Math]::Max($Width / $Image.Width, $Height / $Image.Height)
  $drawWidth = [int][Math]::Ceiling($Image.Width * $scale)
  $drawHeight = [int][Math]::Ceiling($Image.Height * $scale)
  $Graphics.DrawImage($Image, [int](($Width - $drawWidth) / 2), [int](($Height - $drawHeight) / 2), $drawWidth, $drawHeight)
}

$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$source = [System.IO.Path]::GetFullPath($SourceDir)
$output = [System.IO.Path]::GetFullPath($OutDir)
$allowedSource = [System.IO.Path]::GetFullPath((Join-Path $repo 'build\installer\source'))
$allowedOutput = [System.IO.Path]::GetFullPath((Join-Path $repo 'installer\setup\public\assets'))
if ($source -ne $allowedSource -or $output -ne $allowedOutput) {
  throw 'Installer art paths must remain in their fixed repository locations.'
}
New-Item -ItemType Directory -Force -Path $output | Out-Null

$generated = [System.Drawing.Image]::FromFile((Join-Path $source 'studio-generated.png'))
try {
  $master = New-Canvas 2048 1280
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($master)
    try {
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      Draw-Cover $graphics $generated 2048 1280
    } finally { $graphics.Dispose() }
    $master.Save((Join-Path $output 'studio-master.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $master.Dispose() }
} finally { $generated.Dispose() }

$characters = @(
  'rinari-setup.png',
  'rinari-installing.png',
  'rinari-ready.png',
  'rinari-maintenance.png',
  'rinari-uninstall.png',
  'rinari-goodbye.png'
)
$manifest = [ordered]@{}
foreach ($name in $characters) {
  $input = Join-Path $source $name
  $image = [System.Drawing.Bitmap]::FromFile($input)
  try {
    if (-not [System.Drawing.Image]::IsAlphaPixelFormat($image.PixelFormat)) {
      throw "$name must preserve an alpha channel."
    }
    Copy-Item -LiteralPath $input -Destination (Join-Path $output $name) -Force
    $manifest[$name] = [ordered]@{ width = $image.Width; height = $image.Height }
  } finally { $image.Dispose() }
}
# El icono del chrome del instalador sale de la **misma** fuente canónica que
# `build/icon.ico`, no de la ilustración de marca del renderer: los dos son
# identidad de aplicación y tienen que cambiar juntos.
Copy-Item -LiteralPath (Join-Path $repo 'build\icon-source.png') -Destination (Join-Path $output 'rinari-icon.png') -Force

$assetNames = @($characters) + @('rinari-icon.png', 'studio-master.png')
foreach ($name in ($assetNames | Sort-Object)) {
  $asset = Get-Item -LiteralPath (Join-Path $output $name)
  if (-not $manifest.Contains($name)) { $manifest[$name] = [ordered]@{} }
  $stream = [System.IO.File]::OpenRead($asset.FullName)
  try {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { $digest = ([System.BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
  } finally { $stream.Dispose() }
  $manifest[$name].sha256 = $digest
  $manifest[$name].bytes = $asset.Length
}
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText(
  (Join-Path $output 'art-manifest.json'),
  ($manifest | ConvertTo-Json -Depth 4),
  $utf8
)
Write-Host "Verified $($characters.Count) character assets and the 2048x1280 master background."

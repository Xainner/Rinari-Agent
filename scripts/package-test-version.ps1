#Requires -Version 5.1
param(
  [Parameter(Mandatory = $true)][string] $Version
)
$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$') { throw "Invalid version: $Version" }
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Push-Location $root
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'renderer build failed' }
  $previousE2E = $env:RINARI_BUILD_UPDATE_E2E
  try {
    $env:RINARI_BUILD_UPDATE_E2E = '1'
    npm run desktop:build
    if ($LASTEXITCODE -ne 0) { throw 'desktop build failed' }
  } finally {
    if ($null -eq $previousE2E) { Remove-Item Env:RINARI_BUILD_UPDATE_E2E -ErrorAction SilentlyContinue }
    else { $env:RINARI_BUILD_UPDATE_E2E = $previousE2E }
  }
  npx electron-builder --win dir --x64 --publish never "-c.extraMetadata.version=$Version"
  if ($LASTEXITCODE -ne 0) { throw 'Electron payload build failed' }
  & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-setup-payload.ps1 -Version $Version
  if ($LASTEXITCODE -ne 0) { throw 'setup payload packaging failed' }
  $previousVersion = $env:RINARI_SETUP_VERSION
  try {
    $env:RINARI_SETUP_VERSION = $Version
    npm run setup:build
    if ($LASTEXITCODE -ne 0) { throw 'setup build failed' }
  } finally {
    if ($null -eq $previousVersion) { Remove-Item Env:RINARI_SETUP_VERSION -ErrorAction SilentlyContinue }
    else { $env:RINARI_SETUP_VERSION = $previousVersion }
  }
  & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/finalize-setup.ps1 -Version $Version
  if ($LASTEXITCODE -ne 0) { throw 'setup finalization failed' }
  node scripts/generate-update-metadata.mjs --version $Version
  if ($LASTEXITCODE -ne 0) { throw 'update metadata generation failed' }
} finally {
  Pop-Location
}

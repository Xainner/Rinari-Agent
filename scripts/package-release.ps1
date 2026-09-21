#Requires -Version 5.1
param([switch] $SkipEngine)
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$version = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$') { throw "Invalid package version: $version" }
Push-Location $root
try {
  npm run installer:art
  if ($LASTEXITCODE -ne 0) { throw 'installer art failed' }
  if (-not $SkipEngine) {
    npm run package:engine
    if ($LASTEXITCODE -ne 0) { throw 'Engine packaging failed' }
  } elseif (-not (Test-Path -LiteralPath 'engine-dist\python.exe')) {
    throw 'The staged Engine is missing.'
  }
  npm run package:hashes
  if ($LASTEXITCODE -ne 0) { throw 'package hashes failed' }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'renderer build failed' }
  npm run desktop:build
  if ($LASTEXITCODE -ne 0) { throw 'desktop build failed' }
  $mainBundle = Get-Content -LiteralPath 'dist-electron\main.cjs' -Raw
  foreach ($testToken in 'RINARI_UPDATE_E2E_RESULT','RINARI_UPDATE_FEED_URL') {
    if ($mainBundle.Contains($testToken)) {
      throw "Release bundle contains test-only updater token: $testToken"
    }
  }
  npx electron-builder --win dir --x64 --publish never
  if ($LASTEXITCODE -ne 0) { throw 'Electron payload build failed' }
  & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-setup-payload.ps1 -Version $version
  if ($LASTEXITCODE -ne 0) { throw 'setup payload packaging failed' }
  $previousVersion = $env:RINARI_SETUP_VERSION
  try {
    $env:RINARI_SETUP_VERSION = $version
    npm run setup:build
    if ($LASTEXITCODE -ne 0) { throw 'setup build failed' }
  } finally {
    if ($null -eq $previousVersion) { Remove-Item Env:RINARI_SETUP_VERSION -ErrorAction SilentlyContinue }
    else { $env:RINARI_SETUP_VERSION = $previousVersion }
  }
  & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/finalize-setup.ps1 -Version $version
  if ($LASTEXITCODE -ne 0) { throw 'setup finalization failed' }
  node scripts/generate-update-metadata.mjs --version $version
  if ($LASTEXITCODE -ne 0) { throw 'update metadata generation failed' }
} finally {
  Pop-Location
}

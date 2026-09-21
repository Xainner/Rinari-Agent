#Requires -Version 5.1
param(
  [string] $BaseVersion = '0.2.0',
  [string] $UpdateVersion = '0.2.1',
  [switch] $SkipBuild,
  [string] $EvidenceDir = ''
)
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$work = Join-Path $env:TEMP ("rinari-updater-e2e-" + [guid]::NewGuid().ToString('N'))
$install = Join-Path $work 'Rinari actualización 你好'
$feed = Join-Path $work 'feed'
$profile = Join-Path $work 'profile'
$portFile = Join-Path $work 'port.txt'
$server = $null

function Wait-Result([string] $Path, [int] $Seconds = 180) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  $result = $null
  while ((Get-Date) -lt $deadline) {
    if (Test-Path -LiteralPath $Path) {
      try {
        $candidate = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json -ErrorAction Stop
        if ($null -ne $candidate -and $null -ne $candidate.ok) {
          $result = $candidate
          break
        }
      } catch {
        # The app writes the result atomically enough for production use, but
        # the test process can observe the file between create and flush.
      }
    }
    Start-Sleep -Milliseconds 250
  }
  if ($null -eq $result) { throw "Timed out waiting for a complete update result: $Path" }
  if ($result.ok -ne $true) { throw "Update probe failed: $($result | ConvertTo-Json -Compress)" }
  return $result
}

function Invoke-Probe([string] $Name, [bool] $ExpectFailure) {
  $resultPath = Join-Path $work "$Name.json"
  Remove-Item -LiteralPath $resultPath -Force -ErrorAction SilentlyContinue
  $env:RINARI_UPDATE_E2E_RESULT = $resultPath
  $env:RINARI_UPDATE_E2E_EXPECTED = $UpdateVersion
  $env:RINARI_UPDATE_E2E_EXPECT_FAILURE = $(if ($ExpectFailure) { '1' } else { '0' })
  $env:RINARI_UPDATE_E2E_PROFILE = $profile
  $env:RINARI_UPDATE_FEED_URL = "http://127.0.0.1:$port/"
  $env:RINARI_HOME = Join-Path $work 'engine-home'
  $env:RINARI_KEYRING = '0'
  Start-Process -FilePath (Join-Path $install 'rinari-agent.exe') -WindowStyle Hidden | Out-Null
  return Wait-Result $resultPath
}

New-Item -ItemType Directory -Force -Path $work, $feed | Out-Null
try {
  Push-Location $root
  try {
    if (-not $SkipBuild) {
      npm run installer:art
      if ($LASTEXITCODE -ne 0) { throw 'installer art failed' }
      npm run package:hashes
      if ($LASTEXITCODE -ne 0) { throw 'package hashes failed' }
      & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-test-version.ps1 -Version $BaseVersion
      Copy-Item -LiteralPath "release\installer\Rinari-Agent-Setup-$BaseVersion-x64.exe" -Destination (Join-Path $work 'base.exe')
      & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-test-version.ps1 -Version $UpdateVersion
    } else {
      Copy-Item -LiteralPath "release\installer\Rinari-Agent-Setup-$BaseVersion-x64.exe" -Destination (Join-Path $work 'base.exe')
    }
    $baseSetup = Join-Path $work 'base.exe'
    $updateSetup = Join-Path $root "release\installer\Rinari-Agent-Setup-$UpdateVersion-x64.exe"
    $latest = Join-Path $root 'release\installer\latest.yml'
    if (-not (Test-Path -LiteralPath $baseSetup)) { throw "Base setup missing: $baseSetup" }
    Copy-Item -LiteralPath $updateSetup -Destination $feed -Force
    Copy-Item -LiteralPath $latest -Destination $feed -Force

    $installed = Start-Process -FilePath $baseSetup -ArgumentList @('--silent-install', ('"' + $install + '"')) -Wait -PassThru -WindowStyle Hidden
    if ($installed.ExitCode -ne 0) { throw "Base install failed: $($installed.ExitCode)" }

    $server = Start-Process -FilePath 'node.exe' -ArgumentList @('scripts/serve-update-fixture.mjs', ('"' + $feed + '"'), ('"' + $portFile + '"')) -PassThru -WindowStyle Hidden
    $deadline = (Get-Date).AddSeconds(15)
    while (-not (Test-Path -LiteralPath $portFile) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 100 }
    if (-not (Test-Path -LiteralPath $portFile)) { throw 'Update fixture server did not start' }
    $port = (Get-Content -LiteralPath $portFile -Raw).Trim()

    $goodMetadata = Get-Content -LiteralPath (Join-Path $feed 'latest.yml') -Raw
    $badDigest = [Convert]::ToBase64String((New-Object byte[] 64))
    $altered = [regex]::Replace($goodMetadata, 'sha512: "[^"]+"', ('sha512: "' + $badDigest + '"'))
    [System.IO.File]::WriteAllText((Join-Path $feed 'latest.yml'), $altered, (New-Object System.Text.UTF8Encoding($false)))
    $metadataResult = Invoke-Probe 'metadata-rejected' $true
    if ($metadataResult.stage -ne 'rejected') { throw 'Altered metadata was not rejected' }

    [System.IO.File]::WriteAllText((Join-Path $feed 'latest.yml'), $goodMetadata, (New-Object System.Text.UTF8Encoding($false)))
    $servedSetup = Join-Path $feed (Split-Path -Leaf $updateSetup)
    Add-Content -LiteralPath $servedSetup -Value 'corrupt' -NoNewline
    $payloadResult = Invoke-Probe 'payload-rejected' $true
    if ($payloadResult.stage -ne 'rejected') { throw 'Corrupt payload was not rejected' }

    Copy-Item -LiteralPath $updateSetup -Destination $servedSetup -Force
    $updatedResult = Invoke-Probe 'updated' $false
    if ($updatedResult.current -ne $UpdateVersion) { throw "Relaunched version is $($updatedResult.current)" }
    $record = Get-Content -LiteralPath (Join-Path $install '.rinari-install.json') -Raw | ConvertFrom-Json
    if ($record.version -ne $UpdateVersion) { throw "Installed marker is $($record.version)" }
    if ($EvidenceDir) {
      $evidence = [System.IO.Path]::GetFullPath((Join-Path $root $EvidenceDir))
      New-Item -ItemType Directory -Force -Path $evidence | Out-Null
      Copy-Item -LiteralPath (Join-Path $work 'metadata-rejected.json'), (Join-Path $work 'payload-rejected.json'), (Join-Path $work 'updated.json') -Destination $evidence -Force
      [ordered]@{ base = $BaseVersion; update = $UpdateVersion; marker = $record.version; unsigned = $true } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'summary.json') -Encoding utf8
    }
    Write-Host "Updater E2E PASS: $BaseVersion -> $UpdateVersion; altered metadata and payload rejected"
  } finally {
    Pop-Location
  }
} finally {
  foreach ($name in 'RINARI_UPDATE_E2E_RESULT','RINARI_UPDATE_E2E_EXPECTED','RINARI_UPDATE_E2E_EXPECT_FAILURE','RINARI_UPDATE_E2E_PROFILE','RINARI_UPDATE_FEED_URL','RINARI_HOME','RINARI_KEYRING') {
    Remove-Item "Env:$name" -ErrorAction SilentlyContinue
  }
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
  if (Test-Path -LiteralPath $install) {
    $uninstaller = Join-Path $install 'Rinari-Setup.exe'
    if (Test-Path -LiteralPath $uninstaller) {
      Start-Process -FilePath $uninstaller -ArgumentList @('--silent-uninstall', ('"' + $install + '"')) -Wait -WindowStyle Hidden | Out-Null
    }
  }
  Write-Host "Evidence directory: $work"
}

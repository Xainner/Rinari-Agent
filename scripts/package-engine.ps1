#Requires -Version 5.1
<#
  Empaqueta el Rinari Engine como sidecar portable (ADR 0001, opción 1):
  Python empaquetado + paquete `rinari` instalado vía pip.

  Uso:
    powershell -ExecutionPolicy Bypass -File scripts/package-engine.ps1 `
      -CliRepo C:/Users/Xainner/Documents/DEV/Rinari-CLI `
      -PythonVersion 3.12.10

  Salida: engine-dist/
    python.exe, Lib/site-packages/rinari..., ENGINE_VERSION

  El desktop lo descubre vía `process.resourcesPath` (bundle primero,
  RINARI_ENGINE_BIN/PATH como fallback de desarrollo).
#>
param(
  [string]$CliRepo = (Join-Path (Split-Path $PSScriptRoot -Parent) "..\\..\\Rinari-CLI"),
  [string]$PythonVersion = "3.12.10",
  [switch]$Development,
  [string]$OutDir = (Join-Path $PSScriptRoot "..\\engine-dist")
)

$ErrorActionPreference = "Stop"
$manifest = Get-Content (Join-Path $PSScriptRoot "..\engine-manifest.json") -Raw | ConvertFrom-Json
$sourceSha = (git -C $CliRepo rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceSha -ne $manifest.engine_git_sha) {
  throw "El checkout del engine no coincide con el pin. No se modificó el paquete existente."
}
$sourceDirty = [bool](git -C $CliRepo status --porcelain)
if (($sourceDirty -or $manifest.development_build) -and -not $Development) {
  throw "La fuente contiene cambios locales. Usa -Development para un paquete identificado como desarrollo."
}

$tag = $PythonVersion -replace "\.", ""
$embedUrl = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"
$getPipUrl = "https://bootstrap.pypa.io/get-pip.py"
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) "rinari-engine-pkg"
$repoRoot = [System.IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
$resolvedOut = [System.IO.Path]::GetFullPath($OutDir)
$allowedOutput = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "engine-dist"))
if ($allowedOutput -ne $resolvedOut) {
  throw "OutDir debe ser exactamente engine-dist dentro del repositorio"
}
if (Test-Path -LiteralPath $resolvedOut) {
  Remove-Item -LiteralPath $resolvedOut -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $tmp, $resolvedOut | Out-Null
$OutDir = $resolvedOut

Write-Host "--> wheel del engine"
$manifest = Get-Content (Join-Path $PSScriptRoot "..\engine-manifest.json") -Raw | ConvertFrom-Json
Push-Location $CliRepo
try {
  $fullSha = (git rev-parse HEAD).Trim()
  if ($fullSha -ne $manifest.engine_git_sha) {
    throw "CLI en $fullSha no coincide con engine-manifest.json ($($manifest.engine_git_sha)). Actualiza el pin o el checkout."
  }
  uv build --wheel
  if ($LASTEXITCODE -ne 0) { throw "uv build falló" }
  $wheel = Get-ChildItem dist/*.whl | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $wheel) { throw "uv build no produjo wheel" }
  $engineSha = (git rev-parse --short HEAD).Trim()
} finally { Pop-Location }

Write-Host "--> python empaquetado $PythonVersion"
$embedZip = Join-Path $tmp "embed.zip"
Invoke-WebRequest -Uri $embedUrl -OutFile $embedZip
Expand-Archive -Path $embedZip -DestinationPath $OutDir -Force

# Habilitar site + pip en el .pth del empaquetado
$pth = Get-ChildItem (Join-Path $OutDir "python*._pth") | Select-Object -First 1
$text = Get-Content $pth.FullName -Raw
$text = $text -replace "#import site", "import site"
$text | Set-Content $pth.FullName -NoNewline

Write-Host "--> pip"
$getPip = Join-Path $tmp "get-pip.py"
Invoke-WebRequest -Uri $getPipUrl -OutFile $getPip
& (Join-Path $OutDir "python.exe") $getPip --no-warn-script-location
if ($LASTEXITCODE -ne 0) { throw "get-pip falló" }

Write-Host "--> instalar rinari + deps"
& (Join-Path $OutDir "python.exe") -m pip install --no-warn-script-location --force-reinstall $wheel.FullName
if ($LASTEXITCODE -ne 0) { throw "pip install falló" }

$engineVersion = & (Join-Path $OutDir "python.exe") -c "import importlib.metadata; print(importlib.metadata.version('rinari'))"
if ($LASTEXITCODE -ne 0) { $engineVersion = "unknown" }
"rinari=$($engineVersion.Trim())`ncli_sha=$engineSha`npython=$PythonVersion" | Set-Content (Join-Path $OutDir "ENGINE_VERSION")
@{
  base_git_sha = $sourceSha
  development = [bool]$Development
  dirty = $sourceDirty
  wheel_sha256 = (Get-FileHash -LiteralPath $wheel.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
} | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $OutDir "ENGINE_SOURCE.json")

Write-Host "--> OCR portable con binarios e idiomas verificados"
& (Join-Path $OutDir "python.exe") (Join-Path $PSScriptRoot "package-ocr.py") (Join-Path $OutDir "ocr")
if ($LASTEXITCODE -ne 0) { throw "No se pudo empaquetar OCR" }

Write-Host "--> humo: contrato del motor en un home temporal"
& (Join-Path $OutDir "python.exe") (Join-Path $PSScriptRoot "check-engine-tools.py") (Join-Path $OutDir "python.exe")
if ($LASTEXITCODE -ne 0) { throw "El motor empaquetado no cumple el contrato de herramientas" }

Write-Host "OK: $OutDir"

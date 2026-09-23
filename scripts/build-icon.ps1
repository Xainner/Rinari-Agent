# Genera build/icon.ico desde la fuente versionada build/icon-source.png.
#
# Por qué un script y no una conversión a mano: el icono es identidad de la
# aplicación y aparece en el instalador, el ejecutable, los accesos directos,
# la barra de tareas y la entrada de «Aplicaciones instaladas». Un .ico que
# nadie sabe reproducir es un binario huérfano en el repositorio.
#
# Por qué PowerShell y System.Drawing: es lo que ya usa
# `scripts/compose-installer-art.ps1` para el arte del instalador, y evita
# añadir una dependencia npm de imagen —hoy el proyecto no tiene ninguna— sólo
# para empaquetar siete PNG en un contenedor.
#
# El ICO se escribe a mano porque el formato lo permite: cabecera, directorio y
# las imágenes embebidas. Cada entrada va en PNG, que es lo que Windows lee
# desde Vista y lo que conserva el alpha sin la máscara AND del formato DIB
# clásico.

[CmdletBinding()]
param(
  [string]$Source,
  [string]$Output
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

# Las rutas por defecto se resuelven aquí y no en `param`: en Windows
# PowerShell 5.1 `$PSScriptRoot` todavía no está puesto cuando se evalúan los
# valores por defecto de los parámetros.
$root = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $Source) { $Source = Join-Path $root '..\build\icon-source.png' }
if (-not $Output) { $Output = Join-Path $root '..\build\icon.ico' }

$Source = [System.IO.Path]::GetFullPath($Source)
$Output = [System.IO.Path]::GetFullPath($Output)

if (-not (Test-Path -LiteralPath $Source)) {
  throw "No existe la fuente del icono: $Source"
}

# Tamaños que Windows pide en las distintas superficies: lista pequeña (16/24),
# escritorio y Alt+Tab (32/48), vistas grandes (64/128) y el que exige
# electron-builder para el instalador (256).
$sizes = @(16, 24, 32, 48, 64, 128, 256)

$sourceHash = (Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash
$sourceImage = [System.Drawing.Bitmap]::FromFile($Source)
try {
  if (-not [System.Drawing.Image]::IsAlphaPixelFormat($sourceImage.PixelFormat)) {
    throw "La fuente tiene que conservar alpha; llegó como $($sourceImage.PixelFormat)"
  }
  if ($sourceImage.Width -ne $sourceImage.Height) {
    throw "La fuente tiene que ser cuadrada; llegó como $($sourceImage.Width)x$($sourceImage.Height)"
  }

  $frames = New-Object System.Collections.Generic.List[byte[]]
  foreach ($size in $sizes) {
    $canvas = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $canvas.SetResolution(96, 96)
      $graphics = [System.Drawing.Graphics]::FromImage($canvas)
      try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        # `TileFlipXY` evita el halo transparente del borde al reducir: sin él,
        # el muestreo bicúbico mezcla con el exterior del lienzo.
        $attributes = New-Object System.Drawing.Imaging.ImageAttributes
        try {
          $attributes.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
          $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
          $graphics.DrawImage($sourceImage, $rect, 0, 0, $sourceImage.Width, $sourceImage.Height, [System.Drawing.GraphicsUnit]::Pixel, $attributes)
        } finally {
          $attributes.Dispose()
        }
      } finally {
        $graphics.Dispose()
      }

      $buffer = New-Object System.IO.MemoryStream
      try {
        $canvas.Save($buffer, [System.Drawing.Imaging.ImageFormat]::Png)
        $frames.Add($buffer.ToArray())
      } finally {
        $buffer.Dispose()
      }
    } finally {
      $canvas.Dispose()
    }
  }
} finally {
  $sourceImage.Dispose()
}

# Contenedor ICO: 6 bytes de cabecera, 16 por entrada del directorio, y los
# PNG a continuación en el mismo orden.
$stream = [System.IO.File]::Create($Output)
try {
  $writer = New-Object System.IO.BinaryWriter($stream)
  try {
    $writer.Write([uint16]0)              # reservado
    $writer.Write([uint16]1)              # tipo: 1 = icono
    $writer.Write([uint16]$sizes.Count)

    $offset = 6 + (16 * $sizes.Count)
    for ($i = 0; $i -lt $sizes.Count; $i++) {
      $size = $sizes[$i]
      $bytes = $frames[$i]
      # 256 se codifica como 0: el campo es de un byte.
      $writer.Write([byte]($(if ($size -ge 256) { 0 } else { $size })))
      $writer.Write([byte]($(if ($size -ge 256) { 0 } else { $size })))
      $writer.Write([byte]0)              # colores de paleta: ninguno
      $writer.Write([byte]0)              # reservado
      $writer.Write([uint16]1)            # planos
      $writer.Write([uint16]32)           # bits por píxel
      $writer.Write([uint32]$bytes.Length)
      $writer.Write([uint32]$offset)
      $offset += $bytes.Length
    }

    foreach ($bytes in $frames) {
      $writer.Write($bytes)
    }
  } finally {
    $writer.Dispose()
  }
} finally {
  $stream.Dispose()
}

$outputHash = (Get-FileHash -LiteralPath $Output -Algorithm SHA256).Hash
Write-Output "fuente   : $Source"
Write-Output "sha256   : $sourceHash"
Write-Output "salida   : $Output"
Write-Output "sha256   : $outputHash"
Write-Output "tamaños  : $($sizes -join ', ')"

# Cambia la resolución de la pantalla principal (solo para la CI).
#
# El escritorio de los runners de Windows arranca en 1024x768, y una ventana
# de Electron no crece más que la pantalla: las pruebas de interfaz
# (`npm run ui:e2e`) usan ventanas de hasta 1920 px. Usa ChangeDisplaySettings
# directamente, sin depender de módulos que cambian entre imágenes del runner.
param(
  [int]$Width = 1920,
  [int]$Height = 1080
)
$ErrorActionPreference = 'Stop'

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class Display {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
    public short dmSpecVersion, dmDriverVersion, dmSize, dmDriverExtra;
    public int dmFields, dmPositionX, dmPositionY, dmDisplayOrientation, dmDisplayFixedOutput;
    public short dmColor, dmDuplex, dmYResolution, dmTTOption, dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
    public short dmLogPixels;
    public int dmBitsPerPel, dmPelsWidth, dmPelsHeight, dmDisplayFlags, dmDisplayFrequency;
    public int dmICMMethod, dmICMIntent, dmMediaType, dmDitherType, dmReserved1, dmReserved2, dmPanningWidth, dmPanningHeight;
  }
  [DllImport("user32.dll")] public static extern bool EnumDisplaySettings(string device, int mode, ref DEVMODE devMode);
  [DllImport("user32.dll")] public static extern int ChangeDisplaySettings(ref DEVMODE devMode, int flags);
  public static string Current() {
    var mode = new DEVMODE(); mode.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE));
    EnumDisplaySettings(null, -1, ref mode);
    return mode.dmPelsWidth + "x" + mode.dmPelsHeight;
  }
  public static int Set(int width, int height) {
    var mode = new DEVMODE(); mode.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE));
    if (!EnumDisplaySettings(null, -1, ref mode)) return -100;
    mode.dmPelsWidth = width; mode.dmPelsHeight = height;
    mode.dmFields = 0x80000 | 0x100000; // DM_PELSWIDTH | DM_PELSHEIGHT
    return ChangeDisplaySettings(ref mode, 0x1); // CDS_UPDATEREGISTRY
  }
}
'@

$before = [Display]::Current()
$result = [Display]::Set($Width, $Height)
$after = [Display]::Current()
Write-Host "Display: $before -> $after (ChangeDisplaySettings = $result)"
if ($after -ne "${Width}x${Height}") { throw "The display could not be set to ${Width}x${Height}." }

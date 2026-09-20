# Click físico del sistema para la sonda de viabilidad (documento 03 §7).
#
# Una barrera nativa se prueba con hit-testing real. `sendInputEvent` va
# dirigido a un webContents concreto y se salta la geometría, así que no sirve
# para decidir si una vista superpuesta intercepta el click: haría pasar por
# buena una barrera que no lo es.
#
# Guarda y restaura la posición del cursor: la sonda no deja el puntero movido.

param(
  [Parameter(Mandatory = $true)][int]$X,
  [Parameter(Mandatory = $true)][int]$Y,
  [string]$Text = ''
)

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public class RinariProbeInput {
  [StructLayout(LayoutKind.Sequential)]
  public struct POINT { public int X; public int Y; }

  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT point);
  [DllImport("user32.dll")] public static extern void mouse_event(
    uint flags, uint dx, uint dy, uint data, IntPtr extra);

  public const uint LEFTDOWN = 0x0002;
  public const uint LEFTUP = 0x0004;
}
'@

$origin = New-Object RinariProbeInput+POINT
[void][RinariProbeInput]::GetCursorPos([ref]$origin)

[void][RinariProbeInput]::SetCursorPos($X, $Y)
Start-Sleep -Milliseconds 120
[RinariProbeInput]::mouse_event([RinariProbeInput]::LEFTDOWN, 0, 0, 0, [IntPtr]::Zero)
Start-Sleep -Milliseconds 60
[RinariProbeInput]::mouse_event([RinariProbeInput]::LEFTUP, 0, 0, 0, [IntPtr]::Zero)
Start-Sleep -Milliseconds 120

if ($Text.Length -gt 0) {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.SendKeys]::SendWait($Text)
  Start-Sleep -Milliseconds 120
}

[void][RinariProbeInput]::SetCursorPos($origin.X, $origin.Y)
Write-Output "clicked $X $Y and typed $($Text.Length) chars"

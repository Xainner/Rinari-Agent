/**
 * Icono de la bandeja del sistema. Existe mientras «Seguir en la bandeja al
 * cerrar» está activo: es el camino de vuelta a una ventana oculta y la
 * salida real de la aplicación. «Salir» entra por el coordinador de salida,
 * como el menú y la X, y detiene el Engine de forma coordinada.
 */

import { Menu, Tray, app, type NativeImage } from 'electron'

export interface TrayDeps {
  /** Muestra y enfoca la ventana principal (o la revela si nunca se mostró). */
  onOpen(): void
  onQuit(): void
}

export interface TrayEntry {
  label: string
  run?: () => void
  separator?: boolean
}

/** Entradas del menú; se prueban sin Electron. */
export function trayMenuEntries(deps: TrayDeps): TrayEntry[] {
  return [
    { label: 'Abrir Rinari', run: deps.onOpen },
    { label: '', separator: true },
    { label: 'Salir', run: deps.onQuit },
  ]
}

export function createTrayController(deps: TrayDeps) {
  let tray: Tray | null = null
  let creating: Promise<void> | null = null
  // Se pidió ocultar mientras el icono se cargaba: no se crea al llegar.
  let wanted = false

  // El icono del ejecutable: en la app instalada es el de Rinari (afterPack
  // lo incrusta); no hay que empaquetar otro archivo para la bandeja.
  const icon = (): Promise<NativeImage> => app.getFileIcon(process.execPath, { size: 'small' })

  return {
    async show(): Promise<void> {
      wanted = true
      if (tray || creating) return creating ?? undefined
      creating = icon()
        .then((image) => {
          if (!wanted) return
          tray = new Tray(image)
          tray.setToolTip('Rinari Agent')
          tray.setContextMenu(
            Menu.buildFromTemplate(
              trayMenuEntries(deps).map((entry) =>
                entry.separator ? { type: 'separator' as const } : { label: entry.label, click: entry.run },
              ),
            ),
          )
          // Un clic abre; el menú queda en el clic derecho, como en Windows.
          tray.on('click', () => deps.onOpen())
        })
        .catch((error: unknown) => console.error('[rinari] no se pudo crear el icono de la bandeja:', error))
        .finally(() => {
          creating = null
        })
      return creating
    },

    hide(): void {
      wanted = false
      tray?.destroy()
      tray = null
    },
  }
}

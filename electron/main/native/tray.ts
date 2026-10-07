/**
 * Icono de la bandeja del sistema. Existe mientras «Seguir en la bandeja al
 * cerrar» está activo: es el camino de vuelta a una ventana oculta y la
 * salida real de la aplicación. «Salir» entra por el coordinador de salida,
 * como el menú y la X, y detiene el Engine de forma coordinada.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { Menu, Tray, app, nativeImage, type NativeImage } from 'electron'

import type { HostText } from './hostText'

export interface TrayDeps {
  /** Muestra y enfoca la ventana principal (o la revela si nunca se mostró). */
  onOpen(): void
  onQuit(): void
  /** Etiquetas en el idioma actual de la interfaz. */
  text(): HostText
}

export interface TrayEntry {
  label: string
  run?: () => void
  separator?: boolean
}

/** Entradas del menú; se prueban sin Electron. */
export function trayMenuEntries(deps: TrayDeps): TrayEntry[] {
  const text = deps.text()
  return [
    { label: text.trayOpen, run: deps.onOpen },
    { label: '', separator: true },
    { label: text.trayQuit, run: deps.onQuit },
  ]
}

export function createTrayController(deps: TrayDeps) {
  let tray: Tray | null = null
  let creating: Promise<void> | null = null
  let base: NativeImage | null = null
  // Indicador de atención vigente: se recuerda aunque la bandeja no exista,
  // para que aparezca al día cuando se active (o termine de cargar).
  let face: NativeImage | null = null
  let tooltip = 'Rinari Agent'
  const paint = () => {
    if (!tray) return
    tray.setImage(face ?? base ?? nativeImage.createEmpty())
    tray.setToolTip(tooltip)
  }
  // Se pidió ocultar mientras el icono se cargaba: no se crea al llegar.
  let wanted = false

  // Icono propio (build/tray.ico, recortado sobre la cara y con los tamaños
  // de la bandeja): el del ejecutable, reducido a 16 px, no se reconoce. El
  // del ejecutable queda como respaldo si el archivo faltara.
  const icon = async (): Promise<NativeImage> => {
    const path = app.isPackaged
      ? join(process.resourcesPath, 'tray.ico')
      : join(__dirname, '..', 'build', 'tray.ico')
    const image = existsSync(path) ? nativeImage.createFromPath(path) : null
    return image && !image.isEmpty() ? image : app.getFileIcon(process.execPath, { size: 'small' })
  }

  const contextMenu = () =>
    Menu.buildFromTemplate(
      trayMenuEntries(deps).map((entry) =>
        entry.separator ? { type: 'separator' as const } : { label: entry.label, click: entry.run },
      ),
    )

  return {
    async show(): Promise<void> {
      wanted = true
      if (tray || creating) return creating ?? undefined
      creating = icon()
        .then((image) => {
          if (!wanted) return
          base = image
          tray = new Tray(face ?? image)
          tray.setToolTip(tooltip)
          tray.setContextMenu(contextMenu())
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

    /** Marca de atención y texto; `null` vuelve a la cara de siempre. */
    setIndicator(image: NativeImage | null, text: string): void {
      face = image
      tooltip = text || 'Rinari Agent'
      paint()
    },

    /** Cambió el idioma: se rehace el menú del icono si existe. */
    refresh(): void {
      tray?.setContextMenu(contextMenu())
    },
  }
}

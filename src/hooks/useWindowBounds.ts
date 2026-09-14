import { useEffect } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { currentMonitor, getCurrentWindow, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/window'
import { toast } from 'sonner'
import { useI18n } from '../i18n'
export function useWindowBounds() {
  const { t } = useI18n()
  useEffect(() => {
    if (!isTauri()) return
    let disposed = false
    void (async () => {
      const win = getCurrentWindow()
      if (await win.isMaximized()) return
      const monitor = await currentMonitor()
      if (!monitor || disposed) return
      const outer = await win.outerSize()
      const inner = await win.innerSize()
      const position = await win.outerPosition()
      const area = monitor.workArea
      const width = Math.min(outer.width, area.size.width)
      const height = Math.min(outer.height, area.size.height)
      // setSize accepts client dimensions; account for the native frame.
      if (width !== outer.width || height !== outer.height) await win.setSize(new PhysicalSize(Math.max(1, width - (outer.width - inner.width)), Math.max(1, height - (outer.height - inner.height))))
      const x = Math.max(area.position.x, Math.min(position.x, area.position.x + area.size.width - width))
      const y = Math.max(area.position.y, Math.min(position.y, area.position.y + area.size.height - height))
      if (x !== position.x || y !== position.y) await win.setPosition(new PhysicalPosition(x, y))
    })().catch(() => { if (!disposed) toast.error(t('home.windowError')) })
    return () => { disposed = true }
  }, [t])
}

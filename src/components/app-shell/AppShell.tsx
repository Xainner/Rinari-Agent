import { useState, type ReactNode } from 'react'
import { Drawer } from 'vaul'
import { SIDEBAR_WIDTH, useUIStore } from '../../stores/ui'
import { useWindowBounds } from '../../hooks/useWindowBounds'
import { useDragResize } from '../../hooks/useDragResize'
import { translate } from '../../i18n'
import { cn } from '../../lib/utils'
import { ResizeHandle } from '../ui/resize-handle'

interface AppShellProps {
  sidebar: ReactNode
  /** Barra superior persistente (`AppStatusBar`): visible en home, conversación, Boards y auxiliares. */
  topbar: ReactNode
  children: ReactNode
  banner?: ReactNode
}

/**
 * Shell: sidebar desktop de ancho ajustable (arrastrando su borde; se
 * recuerda) / rail 72px colapsado / Sheet móvil, barra superior persistente y
 * contenido.
 */
export default function AppShell({ sidebar, topbar, children, banner }: AppShellProps) {
  useWindowBounds()
  const mobileOpen = useUIStore((s) => s.sidebarOpen)
  const setMobileOpen = useUIStore((s) => s.setSidebarOpen)
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const width = useUIStore((s) => s.sidebarWidth)
  const setWidth = useUIStore((s) => s.setSidebarWidth)
  const lang = useUIStore((s) => s.lang)
  // Mientras se arrastra, el ancho vive aquí; al soltar se guarda.
  const [liveWidth, setLiveWidth] = useState<number | null>(null)
  const { handleProps } = useDragResize({
    value: liveWidth ?? width,
    min: SIDEBAR_WIDTH.min,
    // Nunca más de dos quintos de la ventana: la conversación sigue siendo lo principal.
    max: () => Math.max(SIDEBAR_WIDTH.min, Math.min(SIDEBAR_WIDTH.max, Math.round(window.innerWidth * 0.4))),
    direction: 'right',
    onChange: setLiveWidth,
    onCommit: (final) => { setWidth(final); setLiveWidth(null) },
    disabled: collapsed,
  })

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-[var(--bg-app)] text-[var(--text)]">
      <div className="flex min-h-0 flex-1">
        <aside
          className={cn('app-sidebar relative hidden shrink-0 flex-col border-r border-[var(--line-1)] bg-[var(--bg-sidebar)] lg:flex')}
          style={{ width: collapsed ? 72 : liveWidth ?? width }}
          data-resizing={liveWidth !== null || undefined}
          aria-label="Rinari Agent"
        >
          {sidebar}
          {!collapsed && (
            <ResizeHandle
              {...handleProps}
              label={translate(lang, 'sidebar.resize')}
              className="app-sidebar-resizer"
              // Doble clic en el borde: vuelve al ancho de siempre.
              onDoubleClick={() => setWidth(SIDEBAR_WIDTH.initial)}
            />
          )}
        </aside>

        <Drawer.Root open={mobileOpen} onOpenChange={setMobileOpen} direction="left">
          <Drawer.Portal>
            <Drawer.Overlay className="r-overlay fixed inset-0 z-40 lg:hidden" />
            <Drawer.Content
              aria-label="Rinari Agent"
              className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-[var(--border)] bg-[var(--bg-sidebar)] outline-none lg:hidden"
            >
              {sidebar}
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>

        <div className="flex min-w-0 flex-1 flex-col">
          {topbar}
          {banner}
          <main className="relative min-h-0 flex-1 overflow-hidden">{children}</main>
        </div>
      </div>
    </div>
  )
}

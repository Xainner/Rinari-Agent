import { useEffect } from 'react'

export interface WorkspaceRefreshDetail {
  sessionId?: string
  projectRoot?: string
  turnId?: string
}

/**
 * Mantiene vivo el estado Git de una raíz de proyecto mientras haya un
 * consumidor montado (vista Normal o un panel del board).
 *
 * - Una consulta deduplicada al montar (`loadStatus` ya comparte por raíz).
 * - `rinari-workspace-refresh` fuerza la recarga. Un evento con `detail`
 *   scoped a otra raíz se ignora; un evento legacy sin detail es una
 *   invalidación general y se acepta.
 */
export function useProjectRootWatch(
  root: string | null,
  loadStatus: (root: string, force?: boolean) => Promise<unknown>,
  options: { enabled?: boolean } = {},
): void {
  const enabled = options.enabled ?? true
  useEffect(() => {
    if (!enabled || !root) return
    void loadStatus(root)
  }, [enabled, root, loadStatus])

  useEffect(() => {
    if (!enabled || !root) return
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceRefreshDetail | undefined>).detail
      if (detail?.projectRoot && detail.projectRoot !== root) return
      void loadStatus(root, true)
    }
    window.addEventListener('rinari-workspace-refresh', refresh)
    return () => window.removeEventListener('rinari-workspace-refresh', refresh)
  }, [enabled, root, loadStatus])
}

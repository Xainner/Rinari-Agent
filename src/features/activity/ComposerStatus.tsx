import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { ChecklistDock, useChecklistLoad } from '../checklist/ChecklistDock'
import { useChecklistStore } from '../checklist/checklistStore'
import { useOptionalRuntimeStore } from '../engine/EngineContext'
import { createRuntimeStore } from '../engine/runtimeStore'
import { selectLatestTurn } from '../engine/sessionSelectors'
import { turnIsActive } from './activityPresentation'
import type { TurnTimeline } from './types'

/** What opening or closing takes (`--dur-base`), with margin; it also ends without `transitionend`. */
const STATUS_TRANSITION_MS = 260
const NO_RUNTIME = createRuntimeStore()

type Phase = 'closed' | 'opening' | 'open' | 'settled' | 'closing'

/**
 * The status at the top of the composer (plan C): while a turn runs, what
 * Rinari is doing, its time and the tokens the model produced; when she keeps
 * a list, its steps in the same bar. It stays in sight in a long conversation,
 * where a card at the top of the turn scrolled away.
 *
 * It subscribes to its own conversation, so a streamed delta re-renders this
 * bar and not the composer. It opens and closes when the turn starts or ends,
 * never when the view mounts on a turn already running.
 */
export function ComposerStatus({ sessionId }: { sessionId: string }) {
  useChecklistLoad(sessionId)
  const store = useOptionalRuntimeStore() ?? NO_RUNTIME
  const live = useStore(store, (state) => {
    const latest = selectLatestTurn(state, sessionId)
    return latest && turnIsActive(latest.status) ? latest : null
  })
  const hasList = useChecklistStore((state) => Boolean(state.bySession[sessionId]?.checklist))
  const visible = Boolean(live) || hasList
  const root = useRef<HTMLDivElement>(null)
  const { phase, height } = usePresence(visible, sessionId, root)
  // While it closes it keeps saying what it said last instead of going blank.
  const shown = useRef<TurnTimeline | null>(null)
  if (visible) shown.current = live
  if (phase === 'closed') return null
  return (
    <div
      ref={root}
      className="composer-status"
      data-testid="composer-status"
      data-phase={phase}
      style={phase === 'closing' ? { height } : undefined}
      inert={phase === 'closing' || undefined}
    >
      <div className="composer-status-clip">
        <ChecklistDock sessionId={sessionId} live={visible ? live : shown.current} />
      </div>
    </div>
  )
}

/**
 * Opening mounts it closed and opens it on a later frame, so its height
 * grows; closing pins the height it had and folds it to zero, then unmounts.
 * A conversation that mounts (or is switched to) with something to show
 * starts open, without animating: changes animate, mounts do not.
 */
function usePresence(visible: boolean, identity: string, root: React.RefObject<HTMLDivElement | null>) {
  const [state, setState] = useState<{ phase: Phase; height: number; identity: string }>(() => ({ phase: visible ? 'settled' : 'closed', height: 0, identity }))
  let current = state
  if (state.identity !== identity) {
    current = { phase: visible ? 'settled' : 'closed', height: 0, identity }
    setState(current)
  }
  const phase = current.phase

  useLayoutEffect(() => {
    if (visible) {
      if (phase === 'closed' || phase === 'closing') setState((s) => ({ ...s, phase: 'opening' }))
      return
    }
    if (phase === 'closed' || phase === 'closing') return
    // Pin the height it has now; the next frame folds it to zero.
    const height = root.current?.getBoundingClientRect().height ?? 0
    setState((s) => ({ ...s, phase: 'closing', height }))
  }, [visible, phase, root])

  useEffect(() => {
    if (phase === 'opening') {
      let second = 0
      const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setState((s) => s.phase === 'opening' ? { ...s, phase: 'open' } : s)) })
      // Also without frames (a window that does not paint): never stuck closed.
      const timer = window.setTimeout(() => setState((s) => s.phase === 'opening' ? { ...s, phase: 'open' } : s), STATUS_TRANSITION_MS)
      return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); window.clearTimeout(timer) }
    }
    if (phase === 'open') {
      const timer = window.setTimeout(() => setState((s) => s.phase === 'open' ? { ...s, phase: 'settled' } : s), STATUS_TRANSITION_MS)
      return () => window.clearTimeout(timer)
    }
    if (phase === 'closing') {
      const frame = requestAnimationFrame(() => setState((s) => s.phase === 'closing' ? { ...s, height: 0 } : s))
      const timer = window.setTimeout(() => setState((s) => s.phase === 'closing' ? { ...s, phase: 'closed' } : s), STATUS_TRANSITION_MS)
      return () => { cancelAnimationFrame(frame); window.clearTimeout(timer) }
    }
  }, [phase])

  return current
}

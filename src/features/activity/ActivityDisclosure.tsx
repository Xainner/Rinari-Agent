import { Children, createContext, memo, useContext, useId, useLayoutEffect, useRef, type ReactNode, type DetailsHTMLAttributes } from 'react'
import { ChevronRight } from 'lucide-react'
import { activityKey, useActivityDisclosure, type InspectionSnapshot } from '../../stores/activityDisclosure'
import { useI18n } from '../../i18n'
import { ActivityLayoutContext } from './activityLayout'

/** Keys are relative to a stable activity identity, never to the whole timeline. */
function elements(root: HTMLElement, selector: string) {
  return [...root.querySelectorAll<HTMLElement>(selector)].filter(element => element.closest('[data-inspection-root]') === root && !(selector === 'details' && element.hasAttribute('data-inspection-key'))).map(element => {
    const owner = element.closest<HTMLElement>('[data-activity-item]') ?? root
    const peers = [...owner.querySelectorAll(selector)].filter(e => (e.closest('[data-activity-item]') ?? root) === owner && e.closest('[data-inspection-root]') === root)
    return [JSON.stringify([owner.dataset.activityItem ?? 'root', peers.indexOf(element)]), element] as const
  })
}
function InspectionBody({ stateKey, children, id, className = 'space-y-1.5' }: { stateKey: string; children: ReactNode; id: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const root = ref.current!
    const saved = useActivityDisclosure.getState().entries[stateKey]?.inspection
    if (saved) {
      for (const [key, node] of elements(root, 'details')) if (key in saved.details) (node as HTMLDetailsElement).open = saved.details[key]
      for (const [key, node] of elements(root, '[data-inspection-scroll], pre')) {
        const scroll = saved.scroll[key]
        if (scroll) { node.scrollTop = scroll.top; node.scrollLeft = scroll.left; node.dataset.inspectionFollowing = String(scroll.following ?? false); node.dispatchEvent(new CustomEvent('activity-inspection-restore', { detail: { following: scroll.following ?? false } })) }
      }
    }
    return () => {
      const snapshot: InspectionSnapshot = { details: {}, scroll: {} }
      for (const [key, node] of elements(root, 'details')) snapshot.details[key] = (node as HTMLDetailsElement).open
      for (const [key, node] of elements(root, '[data-inspection-scroll], pre')) snapshot.scroll[key] = { top: node.scrollTop, left: node.scrollLeft, following: node.dataset.inspectionFollowing === 'true' }
      useActivityDisclosure.getState().remember(stateKey, snapshot)
    }
  }, [stateKey])
  return <div ref={ref} id={id} className={className} data-activity-body data-inspection-root={stateKey}>{children}</div>
}

export const ActivityDisclosure = memo(function ActivityDisclosure({ stateKey, header, children, inspectLabel, operations = false, defaultOpen = false }: {
  stateKey: string; header: ReactNode; children?: ReactNode; inspectLabel?: string; operations?: boolean; defaultOpen?: boolean
}) {
  const { t } = useI18n()
  const open = useActivityDisclosure(s => s.entries[stateKey]?.open ?? defaultOpen)
  const id = useId()
  const anchor = useRef<HTMLButtonElement>(null)
  const layout = useContext(ActivityLayoutContext)
  const finish = useRef<(() => void) | null>(null)
  useLayoutEffect(() => {
    if (open && !useActivityDisclosure.getState().entries[stateKey]) useActivityDisclosure.getState().setOpen(stateKey, true)
    finish.current?.(); finish.current = null
  }, [open, stateKey])
  function toggle(next = !open) {
    if (anchor.current) finish.current = layout?.begin(anchor.current) ?? null
    useActivityDisclosure.getState().setOpen(stateKey, next)
  }
  if (!children) return <div className="py-1 text-[13px] text-[var(--text-muted)]">{header}</div>
  return <section data-activity-disclosure={operations ? "operations" : "turn"} className="min-w-0 space-y-2">
    <div className="flex min-w-0 items-center gap-2">
      <button ref={anchor} type="button" aria-label={t(operations ? open ? 'activity.hideOperations' : 'activity.showOperations' : open ? 'activity.hide' : 'activity.show')} aria-expanded={open} aria-controls={id}
        onClick={() => toggle()} className={`disclosure-button ${operations ? 'is-operations' : 'is-turn'}`}>
        <ChevronRight size={14} aria-hidden="true" className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
        <span className="min-w-0 flex-1">{header}</span>
      </button>
      {inspectLabel && <button type="button" className="shrink-0 text-xs text-[var(--warning)]" onClick={() => { toggle(true); anchor.current?.focus() }}>{inspectLabel}</button>}
    </div>
    {open && <InspectionBody stateKey={stateKey} id={id} className={operations ? 'space-y-1.5 pl-1 pt-0.5' : 'space-y-2 pt-1'}>{children}</InspectionBody>}
  </section>
})

// Every operation keeps its own state even when its surrounding run grows or is folded.
export const InspectionScope = createContext(activityKey('', '', '', ''))
export function childInspectionKey(parent: string, child: string): string {
  const parts = JSON.parse(parent) as string[]
  return activityKey(parts[0], parts[1], parts[2], parts[3] + '/' + child)
}
export function InspectionItem({ id, children }: { id: string; children: ReactNode }) {
  const parent = useContext(InspectionScope)
  return <InspectionScope.Provider value={childInspectionKey(parent, id)}>
    <div data-activity-item={id}>{children}</div>
  </InspectionScope.Provider>
}

/** Native summary semantics, with heavyweight contents mounted only while inspecting. */
export function InspectionDetails({ inspectionId, children, onToggle, open: initialOpen, ...props }: DetailsHTMLAttributes<HTMLDetailsElement> & { inspectionId: string }) {
  const scope = useContext(InspectionScope)
  const stateKey = childInspectionKey(scope, inspectionId)
  const open = useActivityDisclosure(s => s.entries[stateKey]?.open ?? initialOpen ?? false)
  const anchor = useRef<HTMLDetailsElement>(null)
  const layout = useContext(ActivityLayoutContext)
  const finish = useRef<(() => void) | null>(null)
  const id = useId()
  const parts = Children.toArray(children)
  useLayoutEffect(() => { finish.current?.(); finish.current = null }, [open])
  return <details {...props} data-inspection-key={stateKey} ref={anchor} open={open} onClick={event => {
    const summary = anchor.current?.firstElementChild
    const target = event.target as HTMLElement
    if (!summary?.contains(target) || target.closest('button, a, input')) return
    event.preventDefault()
    finish.current = layout?.begin(summary as HTMLElement) ?? null
    useActivityDisclosure.getState().setOpen(stateKey, !open)
  }} onToggle={event => {
    const next = event.currentTarget.open
    if (next !== open) useActivityDisclosure.getState().setOpen(stateKey, next)
    onToggle?.(event)
  }}>
    {parts[0]}
    {open && <InspectionBody stateKey={stateKey} id={id}>{parts.slice(1)}</InspectionBody>}
  </details>
}

import { memo, useContext, useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { useActivityDisclosure, type InspectionSnapshot } from '../../stores/activityDisclosure'
import { useI18n } from '../../i18n'
import { ActivityLayoutContext } from './activityLayout'

/** Keys are relative to a stable activity identity, never to the whole timeline. */
function elements(root: HTMLElement, selector: string) {
  return [...root.querySelectorAll<HTMLElement>(selector)].map(element => {
    const owner = element.closest<HTMLElement>('[data-activity-item]') ?? root
    const peers = [...owner.querySelectorAll(selector)].filter(e => (e.closest('[data-activity-item]') ?? root) === owner)
    return [JSON.stringify([owner.dataset.activityItem ?? 'root', peers.indexOf(element)]), element] as const
  })
}
function InspectionBody({ stateKey, children, id }: { stateKey: string; children: ReactNode; id: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const root = ref.current!
    const saved = useActivityDisclosure.getState().entries[stateKey]?.inspection
    if (saved) {
      for (const [key, node] of elements(root, 'details')) if (key in saved.details) (node as HTMLDetailsElement).open = saved.details[key]
      for (const [key, node] of elements(root, '[data-inspection-scroll], pre')) {
        const scroll = saved.scroll[key]
        if (scroll) { node.scrollTop = scroll.top; node.scrollLeft = scroll.left; node.dispatchEvent(new CustomEvent('activity-inspection-restore', { detail: { following: scroll.following ?? false } })) }
      }
    }
    return () => {
      const snapshot: InspectionSnapshot = { details: {}, scroll: {} }
      for (const [key, node] of elements(root, 'details')) snapshot.details[key] = (node as HTMLDetailsElement).open
      for (const [key, node] of elements(root, '[data-inspection-scroll], pre')) snapshot.scroll[key] = { top: node.scrollTop, left: node.scrollLeft, following: node.dataset.inspectionFollowing === 'true' }
      useActivityDisclosure.getState().remember(stateKey, snapshot)
    }
  }, [stateKey])
  return <div ref={ref} id={id} className="space-y-1 border-l border-[var(--border)] pl-3" data-activity-body>{children}</div>
}

export const ActivityDisclosure = memo(function ActivityDisclosure({ stateKey, header, children, inspectLabel }: {
  stateKey: string; header: ReactNode; children?: ReactNode; inspectLabel?: string
}) {
  const { t } = useI18n()
  const open = useActivityDisclosure(s => s.entries[stateKey]?.open ?? false)
  const id = useId()
  const anchor = useRef<HTMLButtonElement>(null)
  const layout = useContext(ActivityLayoutContext)
  const finish = useRef<(() => void) | null>(null)
  useLayoutEffect(() => { finish.current?.(); finish.current = null }, [open])
  function toggle(next = !open) {
    if (anchor.current) finish.current = layout?.begin(anchor.current) ?? null
    useActivityDisclosure.getState().setOpen(stateKey, next)
  }
  if (!children) return <div className="py-1 text-[13px] text-[var(--text-muted)]">{header}</div>
  return <section data-activity-disclosure className="min-w-0 space-y-2">
    <div className="flex min-w-0 items-center gap-2">
      <button ref={anchor} type="button" aria-label={t(open ? 'activity.hide' : 'activity.show')} aria-expanded={open} aria-controls={id}
        onClick={() => toggle()} className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg py-1 text-left text-[13px] text-[var(--text-muted)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-[var(--accent)]">
        <ChevronRight size={14} aria-hidden="true" className={open ? 'shrink-0 rotate-90' : 'shrink-0'} />
        <span className="min-w-0 flex-1">{header}</span>
      </button>
      {inspectLabel && <button type="button" className="shrink-0 text-xs text-amber-300" onClick={() => { toggle(true); anchor.current?.focus() }}>{inspectLabel}</button>}
    </div>
    {open && <InspectionBody stateKey={stateKey} id={id}>{children}</InspectionBody>}
  </section>
})

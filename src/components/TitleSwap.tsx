import { useEffect, useLayoutEffect, useRef, useState, type ElementType } from 'react'
import { useCalmMotion } from '../lib/motion'
import { cn } from '../lib/utils'
import { freshRename } from '../stores/titleMotion'

interface TitleSwapProps {
  /** The conversation the title belongs to; a different one never animates. */
  sessionId?: string | null
  text: string
  className?: string
  /** Tooltip; defaults to the text itself. */
  title?: string
  as?: ElementType
  'aria-hidden'?: boolean
}

const SWAP_MS = 640

/**
 * A conversation title that changes in place when Rinari renames it: the old
 * one lifts away while the new one rises in with a single violet light pass.
 * The box never changes size (one line, truncated), so nothing nearby moves.
 * It only plays when the text changes on screen for the same conversation and
 * the change is a live rename (see `stores/titleMotion`), never on mount.
 */
export function TitleSwap({ sessionId, text, className, title, as: Tag = 'span', ...rest }: TitleSwapProps) {
  const calm = useCalmMotion()
  const previous = useRef({ sessionId, text })
  const [outgoing, setOutgoing] = useState<{ text: string; key: number } | null>(null)

  useLayoutEffect(() => {
    const before = previous.current
    previous.current = { sessionId, text }
    if (before.sessionId !== sessionId) {
      setOutgoing(null) // another conversation: show it as it is
      return
    }
    if (calm || !sessionId || before.text === text || !freshRename(sessionId, text)) return
    setOutgoing({ text: before.text, key: Date.now() })
  }, [sessionId, text, calm])

  useEffect(() => {
    if (!outgoing) return
    const timer = window.setTimeout(() => setOutgoing(null), SWAP_MS)
    return () => window.clearTimeout(timer)
  }, [outgoing])

  return (
    <Tag className={cn('title-swap', className)} title={title ?? text} {...rest}>
      <span key={outgoing?.key ?? 'still'} className={cn('title-swap-text', outgoing && 'is-in')} data-title-swap={outgoing ? 'in' : undefined}>
        {text}
      </span>
      {outgoing && <span aria-hidden="true" className="title-swap-out">{outgoing.text}</span>}
    </Tag>
  )
}

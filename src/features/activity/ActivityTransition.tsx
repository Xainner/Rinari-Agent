import { Component, createRef, type ContextType, type ReactNode } from 'react'
import { ActivityLayoutContext } from './activityLayout'

/** The fold's ghost closes in --dur-base; this bounds it when the window does not paint. */
const FOLD_GHOST_MAX_MS = 400

interface Props {
  identity: string
  /** The turn is still running: its operations are shown inline. */
  live: boolean
  /** Reduced motion: the fold keeps the reader's place but does not animate. */
  calm: boolean
  children: ReactNode
}

type Snapshot = (() => void) | { fold: number; focused: HTMLElement | null } | null

/** Preserve reading across terminal folding and canonical-result classification. */
export class ActivityTransition extends Component<Props> {
  static contextType = ActivityLayoutContext
  declare context: ContextType<typeof ActivityLayoutContext>
  private root = createRef<HTMLDivElement>()
  private ghost: HTMLElement | null = null
  private ghostTimer = 0

  getSnapshotBeforeUpdate(previous: Readonly<Props>): Snapshot {
    if (previous.identity === this.props.identity || !this.root.current) return null
    this.dropGhost()
    const focused = this.root.current.contains(document.activeElement) ? document.activeElement as HTMLElement : null
    // The turn ended: its operations fold into the summary card. The height it
    // loses closes with a ghost instead of all at once.
    if (previous.live && !this.props.live && this.context?.fold) return { fold: this.root.current.getBoundingClientRect().height, focused }
    const finish = this.context?.begin(this.root.current, false)
    return () => {
      finish?.()
      this.restoreFocus(focused)
    }
  }

  componentDidUpdate(_previous: Readonly<Props>, _state: unknown, snapshot: Snapshot) {
    if (typeof snapshot === 'function') snapshot()
    else if (snapshot) {
      this.fold(snapshot.fold)
      this.restoreFocus(snapshot.focused)
    }
  }

  componentWillUnmount() { this.dropGhost() }

  private fold(before: number) {
    const root = this.root.current
    const fold = this.context?.fold
    if (!root || !fold) return
    const delta = before - root.getBoundingClientRect().height
    // A few pixels are not worth a ghost.
    if (delta < 16) return
    const ghost = document.createElement('div')
    ghost.className = 'turn-fold-ghost'
    ghost.setAttribute('aria-hidden', 'true')
    // Where the operations were: right after the summary card, before the result.
    const card = [...root.querySelectorAll<HTMLElement>(':scope > * > [data-activity-disclosure="turn"]')].at(-1)?.parentElement
    if (card) card.after(ghost)
    else root.append(ghost)
    // The ghost takes the list's gap too: its own height is what is left.
    const height = before - root.getBoundingClientRect().height
    if (height <= 0) {
      ghost.remove()
      return
    }
    ghost.style.height = `${height}px`
    if (!fold(ghost, delta, this.props.calm)) {
      ghost.remove()
      return
    }
    this.ghost = ghost
    ghost.addEventListener('animationend', () => this.dropGhost(), { once: true })
    this.ghostTimer = window.setTimeout(() => this.dropGhost(), FOLD_GHOST_MAX_MS)
  }

  private dropGhost() {
    window.clearTimeout(this.ghostTimer)
    this.ghost?.remove()
    this.ghost = null
  }

  private restoreFocus(focused: HTMLElement | null) {
    if (focused && !focused.isConnected) this.root.current?.querySelector<HTMLButtonElement>('[data-activity-disclosure="turn"] button')?.focus({ preventScroll: true })
  }

  render() { return <div data-activity-turn ref={this.root} className="space-y-3">{this.props.children}</div> }
}

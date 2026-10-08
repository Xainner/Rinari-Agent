import { Component, createRef, type ContextType, type ReactNode } from 'react'
import { ActivityLayoutContext } from './activityLayout'

/** Preserve reading across terminal folding and canonical-result classification. */
export class ActivityTransition extends Component<{ identity: string; children: ReactNode }> {
  static contextType = ActivityLayoutContext
  declare context: ContextType<typeof ActivityLayoutContext>
  private root = createRef<HTMLDivElement>()
  getSnapshotBeforeUpdate(previous: Readonly<{ identity: string; children: ReactNode }>) {
    if (previous.identity === this.props.identity || !this.root.current) return null
    const focused = this.root.current.contains(document.activeElement) ? document.activeElement as HTMLElement : null
    const finish = this.context?.begin(this.root.current, false)
    return () => {
      finish?.()
      if (focused && !focused.isConnected) this.root.current?.querySelector<HTMLButtonElement>('[data-activity-disclosure="turn"] button')?.focus({ preventScroll: true })
    }
  }
  componentDidUpdate(_previous: unknown, _state: unknown, finish: (() => void) | null) { finish?.() }
  render() { return <div data-activity-turn ref={this.root} className="space-y-3">{this.props.children}</div> }
}

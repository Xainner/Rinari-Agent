import { Component, createRef, type ContextType, type ReactNode } from 'react'
import { ActivityLayoutContext } from './activityLayout'

/** Capture before React moves public text into a collapsed segment. */
export class ActivityTransition extends Component<{ identity: string; children: ReactNode }> {
  static contextType = ActivityLayoutContext
  declare context: ContextType<typeof ActivityLayoutContext>
  private root = createRef<HTMLDivElement>()
  getSnapshotBeforeUpdate(previous: Readonly<{ identity: string; children: ReactNode }>) {
    if (previous.identity === this.props.identity || !this.root.current) return null
    return this.context?.begin(this.root.current, false) ?? null
  }
  componentDidUpdate(_previous: unknown, _state: unknown, finish: (() => void) | null) { finish?.() }
  render() { return <div ref={this.root} className="space-y-3">{this.props.children}</div> }
}

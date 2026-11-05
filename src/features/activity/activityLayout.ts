import { createContext } from 'react'

/** A chat owns its scroll policy; disclosures never look up another pane's scroller. */
export interface ActivityLayout {
  begin: (anchor: HTMLElement, manual?: boolean) => () => void
  /**
   * A finished turn folded its operations and left `ghost` holding the `delta`
   * pixels it lost. Returns whether the ghost stays to close with its
   * animation; otherwise the chat has kept the reader's place and the caller
   * removes the ghost at once.
   */
  fold?: (ghost: HTMLElement, delta: number, calm: boolean) => boolean
}
export const ActivityLayoutContext = createContext<ActivityLayout | null>(null)

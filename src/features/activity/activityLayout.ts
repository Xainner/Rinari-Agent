import { createContext } from 'react'

/** A chat owns its scroll policy; disclosures never look up another pane's scroller. */
export interface ActivityLayout {
  begin: (anchor: HTMLElement, manual?: boolean) => () => void
}
export const ActivityLayoutContext = createContext<ActivityLayout | null>(null)

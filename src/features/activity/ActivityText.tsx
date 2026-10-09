import { createContext, useContext, type ComponentProps } from 'react'

/** The turn state disables motion while waiting for the user or after termination. */
export const ActivityMotion = createContext(false)

/** A single copy of the label: CSS paints the sheen without changing layout or live announcements. */
export function ActivityText({ active, className = '', ...props }: ComponentProps<'span'> & { active: boolean }) {
  const working = useContext(ActivityMotion)
  return <span {...props} className={`${className}${active && working ? ' activity-text-shimmer' : ''}`} />
}

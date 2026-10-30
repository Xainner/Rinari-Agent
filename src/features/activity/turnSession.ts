import { createContext } from 'react'

/** The conversation a rendered turn belongs to (for actions inside its messages). */
export const TurnSessionContext = createContext<string | null>(null)

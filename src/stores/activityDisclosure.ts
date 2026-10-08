import { create } from 'zustand'

export interface InspectionSnapshot {
  details: Record<string, boolean>
  scroll: Record<string, { top: number; left: number; following?: boolean }>
}
interface Entry { open: boolean; inspection?: InspectionSnapshot }
interface State {
  entries: Record<string, Entry>
  setOpen: (key: string, open: boolean) => void
  remember: (key: string, inspection: InspectionSnapshot) => void
  forgetSession: (sessionId: string) => void
  reset: () => void
}
export const activityKey = (home: string, session: string, turn: string, segment: string) => JSON.stringify([home, session, turn, segment])
// UI only, deliberately not persisted. Removed with the session/runtime; never stores activity content.
export const useActivityDisclosure = create<State>((set) => ({
  entries: {},
  setOpen: (key, open) => set(s => ({ entries: { ...s.entries, [key]: { ...s.entries[key], open } } })),
  remember: (key, inspection) => set(s => s.entries[key] ? ({ entries: { ...s.entries, [key]: { ...s.entries[key], inspection } } }) : s),
  forgetSession: (id) => set(s => ({ entries: Object.fromEntries(Object.entries(s.entries).filter(([key]) => JSON.parse(key)[1] !== id)) })),
  reset: () => set({ entries: {} }),
}))

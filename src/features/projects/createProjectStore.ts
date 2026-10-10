import { create } from 'zustand'

interface CreateProjectState {
  open: boolean
  /** Folders to start with (e.g. a folder dropped or picked elsewhere). */
  paths: string[]
  openWith(paths?: string[]): void
  close(): void
}

/** The project creation window: any part of the app can open it. */
export const useCreateProjectStore = create<CreateProjectState>((set) => ({
  open: false,
  paths: [],
  openWith: (paths = []) => set({ open: true, paths }),
  close: () => set({ open: false, paths: [] }),
}))

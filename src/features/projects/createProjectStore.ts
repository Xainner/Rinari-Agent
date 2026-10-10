import { create } from 'zustand'
import type { ProjectSummary, SessionSummary } from '../../services/engine'

export interface CreateProjectOptions {
  /**
   * What happens once the project exists, instead of the app's default
   * (opening its first conversation in Normal). Boards adds a pane.
   */
  onCreated?: (project: ProjectSummary, session: SessionSummary | null) => void
  /** Create the project's first conversation too (default true). */
  openSession?: boolean
}

interface CreateProjectState {
  open: boolean
  /** Folders to start with (e.g. a folder dropped or picked elsewhere). */
  paths: string[]
  options: CreateProjectOptions
  openWith(paths?: string[], options?: CreateProjectOptions): void
  close(): void
}

/** The project creation window: any part of the app can open it. */
export const useCreateProjectStore = create<CreateProjectState>((set) => ({
  open: false,
  paths: [],
  options: {},
  openWith: (paths = [], options = {}) => set({ open: true, paths, options }),
  close: () => set({ open: false, paths: [], options: {} }),
}))

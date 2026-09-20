export type InstallScope = 'user' | 'machine'
export type SetupOperation = 'install' | 'update' | 'repair' | 'modify' | 'uninstall'

export interface InstallOptions {
  install_dir: string
  scope: InstallScope
  start_menu: boolean
  desktop: boolean
  cli_path: boolean
  remove_cache: boolean
  remove_shortcuts: boolean
}

export interface SetupStatus {
  installed: boolean
  legacy_install: boolean
  version: string | null
  available_version: string
  update_available: boolean
  install_dir: string
  scope: InstallScope
  start_menu: boolean
  desktop: boolean
  cli_path: boolean
  required_bytes: number
  available_bytes: number
  conflicting_cli: string | null
}

export interface SetupPlan {
  operation: SetupOperation
  options: InstallOptions
}

export interface SetupProgress {
  operation: SetupOperation
  phase: string
  detail: string
  completed: number
  total: number
}

export type Screen = 'configure' | 'progress' | 'ready' | 'maintenance' | 'uninstall' | 'goodbye'

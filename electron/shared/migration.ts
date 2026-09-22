/** Formato único de transición Tauri 0.1.3 -> Electron 0.2.x. */
export const MIGRATION_SCHEMA = 'rinari.desktop-preferences.v1' as const
export const MIGRATION_SOURCE_VERSION = '0.1.3' as const
export const MIGRATION_MAX_ENTRIES = 32
export const MIGRATION_MAX_VALUE_BYTES = 2 * 1024 * 1024
export const MIGRATION_MAX_TOTAL_BYTES = 8 * 1024 * 1024

/** Solo estado de presentación. Nada de secretos, permisos ni estado del Engine. */
export const MIGRATION_ALLOWED_KEYS = Object.freeze([
  'rinari.board.v1',
  'rinari.board.attention.v1',
  'rinari.sessionUi.v1',
  'rinari.sessionDock.v1',
  'rinari.composer.drafts.v1',
  'rinari.profile.v1',
  'rinari.lang',
  'rinari.sidebarCollapsed',
  'rinari.shortcutBindings',
  'rinari.enterToSend',
  'rinari.autoFollow',
  'rinari.showSuggestions',
  'rinari.showTechnicalActivityNames',
  'rinari.theme',
  'rinari.accent',
  'rinari.reduceMotion',
  'rinari.provider-wizard.v1',
  'rinari.files.width',
] as const)

export type MigrationState =
  | 'not_started'
  | 'validated'
  | 'staged'
  | 'committed'
  | 'verified'
  | 'failed'

export interface MigrationStatus {
  state: MigrationState
  pending: boolean
  export_id?: string
  source_version?: string
  error?: string
  can_export?: boolean
}

export interface MigrationManifest {
  schema: typeof MIGRATION_SCHEMA
  export_id: string
  source: 'tauri'
  source_version: string
  engine_namespace: string
  created_at: string
  checksum: string
  preferences: Record<string, string>
}

export interface MigrationStage {
  token: string
  status: MigrationStatus
  preferences: Record<string, string>
}

export function canonicalPreferences(preferences: Record<string, string>): string {
  const ordered: Record<string, string> = Object.create(null) as Record<string, string>
  for (const key of Object.keys(preferences).sort()) ordered[key] = preferences[key]
  return JSON.stringify(ordered)
}

export function collectAllowedPreferences(storage: { getItem(key: string): string | null }): Record<string, string> {
  const result: Record<string, string> = Object.create(null) as Record<string, string>
  for (const key of MIGRATION_ALLOWED_KEYS) {
    const value = storage.getItem(key)
    if (value !== null) result[key] = value
  }
  return result
}

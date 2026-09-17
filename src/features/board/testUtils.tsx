import type { ReactNode } from 'react'
import { vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import type { ProjectSummary, SessionSummary } from '../../services/engine'
import { createRuntimeStore } from '../engine/runtimeStore'
import { EngineProvider } from '../engine/EngineContext'
import type { EngineSession } from '../engine/useEngineSession'
import { ProcessRuntimeProvider } from '../processes/ProcessRuntimeProvider'

const now = '2026-09-15T10:00:00Z'

export function projectFixture(id: string, name: string, extra: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id,
    root: `/repo/${id}`,
    canonical_root: `/repo/${id}`,
    name,
    description: '',
    pinned: false,
    archived: false,
    git_fingerprint: null,
    created_at: now,
    updated_at: now,
    last_opened_at: now,
    active_session_id: null,
    ...extra,
  }
}

export function sessionFixture(id: string, title: string, projectId: string | null = null, extra: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id,
    kind: projectId ? 'PROJECT' : 'CHAT',
    title,
    mode: 'build',
    state: 'active',
    updated_at: now,
    project_id: projectId,
    project_root: projectId ? `/repo/${projectId}` : null,
    current_cwd: projectId ? `/repo/${projectId}` : `/chats/${id}`,
    git_branch: null,
    last_active_at: now,
    provider_id: 'p1',
    model_id: 'm1',
    permission_profile: 'workspace',
    effective_permission_profile: 'workspace',
    ...extra,
  }
}

/**
 * `EngineSession` mínimo para montar Boards sin Tauri: comandos espiados y
 * datos estáticos. Los tests sobreescriben lo que necesitan.
 */
export function engineFixture(overrides: Partial<EngineSession> = {}): EngineSession {
  const runtime = createRuntimeStore()
  const sessions = overrides.sessions ?? []
  const base = {
    status: { state: 'ready', engine_version: '0.1.0', protocol_version: 1, detail: null, capabilities: {} },
    runtime,
    engineGeneration: 1,
    sessions,
    sessionsById: Object.fromEntries(sessions.map((row) => [row.id, row])),
    activeSession: '',
    setActiveSession: vi.fn(),
    approvals: [],
    busySessionIds: new Set<string>(),
    ready: true,
    refreshStatus: vi.fn(async () => {}),
    refreshSessions: vi.fn(async () => {}),
    startEngine: vi.fn(async () => {}),
    shutdownEngine: vi.fn(async () => {}),
    restartEngine: vi.fn(async () => {}),
    createSession: vi.fn(async () => null),
    prepareSession: vi.fn(async () => ({ ok: true as const, session: sessions[0] })),
    ensureSessionReady: vi.fn(async () => ({ ok: true as const, session: sessions[0] })),
    ensureHistoryLoaded: vi.fn(async () => {}),
    send: vi.fn(async () => true),
    sendTo: vi.fn(async () => true),
    prepareAttachments: vi.fn(async (items: unknown[]) => items),
    prepareAttachmentsFor: vi.fn(async (_id: string, items: unknown[]) => items),
    cancelAttachmentPreparation: vi.fn(async () => {}),
    cancelAttachmentPreparationFor: vi.fn(async () => {}),
    implementPlan: vi.fn(async () => false),
    implementPlanFor: vi.fn(async () => false),
    cancelTurn: vi.fn(async () => {}),
    cancelTurnFor: vi.fn(async () => {}),
    resolveApproval: vi.fn(async () => {}),
    providers: [],
    models: [],
    catalogLoaded: true,
    sessionsLoaded: true,
    sessionsError: null,
    catalogError: null,
    activeModel: null,
    activeModelFor: vi.fn(() => null),
    isBusy: vi.fn(() => false),
    refreshCatalog: vi.fn(async () => {}),
    discoverCatalog: vi.fn(async () => {}),
    useModel: vi.fn(async () => {}),
    useModelFor: vi.fn(async () => true),
    selectSession: vi.fn(async () => {}),
    setMode: vi.fn(async () => {}),
    setModeFor: vi.fn(async () => true),
    setPermission: vi.fn(async () => {}),
    setPermissionFor: vi.fn(async () => true),
    searchFiles: vi.fn(async () => ({ root: '', files: [] })),
    searchFilesFor: vi.fn(async () => ({ root: '', files: [] })),
    historyInfo: {},
    closedSessions: [],
    archivedSessions: [],
    closeSession: vi.fn(async () => true),
    renameSession: vi.fn(async () => {}),
    archiveSession: vi.fn(async () => true),
    restoreSession: vi.fn(async () => {}),
    forkSession: vi.fn(async () => null),
    deleteSession: vi.fn(async () => null),
    projects: [],
    archivedProjects: [],
    projectsError: null,
    refreshProjects: vi.fn(async () => {}),
    openProject: vi.fn(async () => null),
    updateProject: vi.fn(async () => true),
    removeProject: vi.fn(async () => true),
    loadProjectStatus: vi.fn(async () => {}),
    loadProjectIntelligence: vi.fn(async () => {}),
    trustProject: vi.fn(async () => {}),
    projectStatusByRoot: {},
    projectStatusErrorByRoot: {},
    projectIntelByRoot: {},
    activeProjectRoot: null,
    activeGitStatus: null,
    activeGitError: null,
  }
  return { ...base, ...overrides } as unknown as EngineSession
}

/**
 * Mismo árbol de providers que `App`: el runtime de procesos vive una sola vez
 * por runtime conectado (fuera de los paneles); sin capability no consulta
 * al Engine, así que los tests del board no necesitan mockear `process.*`.
 */
export function BoardHarness({ engine, children }: { engine: EngineSession; children: ReactNode }) {
  return (
    <I18nProvider lang="es">
      <EngineProvider session={engine}>
        <ProcessRuntimeProvider epoch={1} engineReady={engine.ready} hasCapability={false} hasIdentity={false}>
          {children}
        </ProcessRuntimeProvider>
      </EngineProvider>
    </I18nProvider>
  )
}

import type { FlowResult, FlowStage } from '../../services/engine'

/** Fixtures deterministas del contrato `flow.get` para tests de la vista. */
export function stageFixture(overrides: Partial<FlowStage> & Pick<FlowStage, 'id' | 'index'>): FlowStage {
  return {
    cycle_index: 1,
    kind: 'implementation',
    mode: 'build',
    title: `Etapa ${overrides.index}`,
    excerpt: `extracto ${overrides.index}`,
    status: 'done',
    started_at: '2026-09-17T10:00:00.000Z',
    completed_at: '2026-09-17T10:10:00.000Z',
    duration_ms: 600_000,
    progress: 1,
    turns: 1,
    executors: [],
    agents: [],
    sessions: [{ session_id: 'ses_a', title: 'Backend API', turns: 1 }],
    files: [],
    files_more: 0,
    verification: null,
    checkpoints: 0,
    origin_peer_turns: 0,
    anchor: { session_id: 'ses_a', turn_id: `t${overrides.index}` },
    ...overrides,
  }
}

export function flowFixture(stages: FlowStage[], overrides: Partial<FlowResult> = {}): FlowResult {
  const done = stages.filter((stage) => stage.status === 'done').length
  const active = stages.filter((stage) => stage.status === 'active' || stage.status === 'needs_you').length
  const known = stages.filter((stage) => stage.progress !== null)
  const weight = known.reduce((sum, stage) => sum + stage.turns, 0)
  return {
    scope: { kind: 'project', id: 'proj_a', title: 'Backend', root: 'C:/repo/backend' },
    summary: {
      stages_total: stages.length,
      stages_done: done,
      stages_active: active,
      turns_total: stages.reduce((sum, stage) => sum + stage.turns, 0),
      turns_failed: stages.filter((stage) => stage.status === 'failed').length,
      files_changed: stages.reduce((sum, stage) => sum + stage.files.length + stage.files_more, 0),
      tasks: null,
      progress: weight ? known.reduce((sum, stage) => sum + (stage.progress ?? 0) * stage.turns, 0) / weight : null,
      started_at: stages[0]?.started_at ?? null,
      last_activity_at: stages.at(-1)?.completed_at ?? stages.at(-1)?.started_at ?? null,
    },
    stages,
    ...overrides,
  }
}

/** Proyecto real: PLAN → BUILD (dos sesiones, con archivos) → REVIEW fallida → PLAN nuevo en curso. */
export function projectFlowFixture(): FlowResult {
  return flowFixture([
    stageFixture({ id: 'stg_p1', index: 1, kind: 'planning', mode: 'plan', title: 'Diseño de la API', excerpt: 'planifica la API', executors: [{ model: 'opus', calls: 2 }] }),
    stageFixture({
      id: 'stg_b1',
      index: 2,
      title: 'implementa las rutas',
      excerpt: 'implementa las rutas',
      progress: 0.75,
      turns: 3,
      executors: [{ model: 'sonnet', calls: 5 }],
      agents: [{ agent: 'explore', runs: 2 }],
      sessions: [{ session_id: 'ses_a', title: 'Backend API', turns: 2 }, { session_id: 'ses_b', title: 'Docs', turns: 1 }],
      files: [
        { path: 'src/routes/api.ts', kind: 'modified', turn_id: 't2' },
        { path: 'src/routes/auth.ts', kind: 'created', turn_id: 't2' },
        { path: 'tests/api.test.ts', kind: 'created', turn_id: 't3' },
        { path: 'README.md', kind: 'modified', turn_id: 't3' },
        { path: 'src/types.ts', kind: 'modified', turn_id: 't3' },
      ],
      files_more: 3,
      origin_peer_turns: 1,
    }),
    stageFixture({ id: 'stg_r1', index: 3, kind: 'review', mode: 'review', title: 'revisa lo hecho', status: 'failed', progress: 0.5, verification: { passed: 1, failed: 1 }, anchor: { session_id: 'ses_a', turn_id: 't4' } }),
    stageFixture({ id: 'stg_p2', index: 4, cycle_index: 2, kind: 'planning', mode: 'plan', title: 'Segunda fase', status: 'needs_you', completed_at: null, duration_ms: null, progress: null, sessions: [{ session_id: 'ses_c', title: 'Infra', turns: 1 }], anchor: { session_id: 'ses_c', turn_id: 't5' } }),
  ])
}

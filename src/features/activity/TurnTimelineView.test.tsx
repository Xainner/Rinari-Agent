// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import type { TurnTimeline } from './types'
import TurnTimelineView from './TurnTimelineView'
import { engineApi } from '../../services/engine'

const base: TurnTimeline = {
  turnId: 't1', sessionId: 's1', status: 'running', startedAt: 1_000,
  userMessage: 'Hola', items: [],
}

afterEach(cleanup)

function view(timeline: TurnTimeline, now: number, resolve = vi.fn()) {
  return render(<I18nProvider lang="es"><TurnTimelineView timeline={timeline} now={now} onResolveApproval={resolve} onContinue={vi.fn()} /></I18nProvider>)
}

describe('TurnTimelineView', () => {
  it('presents a completed plan in its own card', () => {
    view({ ...base, mode: 'plan', status: 'completed', completedAt: 2_000, items: [{ id: 'model:p', type: 'model', activitySeq: 1, occurredAt: 2_000, modelCallId: 'p', status: 'completed', content: '1. Revisar requisitos\n2. Implementar', outputKind: 'final' }] }, 2_000)
    expect(screen.getByRole('region', { name: 'Plan propuesto' })).toBeTruthy()
    expect(screen.getByText('Revisar requisitos')).toBeTruthy()
  })
  it('debounces thinking and keeps ordinary chat free of completion cards', () => {
    const rendered = view(base, 1_299)
    expect(screen.queryByText('Pensando…')).toBeNull()
    rendered.rerender(<I18nProvider lang="es"><TurnTimelineView timeline={base} now={1_301} onResolveApproval={vi.fn()} onContinue={vi.fn()} /></I18nProvider>)
    expect(screen.getByText('Pensando…')).toBeTruthy()
    rendered.rerender(<I18nProvider lang="es"><TurnTimelineView timeline={{ ...base, status: 'completed', completedAt: 2_000, items: [{ id: 'model:m1', type: 'model', activitySeq: 1, occurredAt: 2_000, modelCallId: 'm1', status: 'completed', content: 'Hola', outputKind: 'final' }] }} now={2_000} onResolveApproval={vi.fn()} onContinue={vi.fn()} /></I18nProvider>)
    expect(screen.getAllByText('Hola')).toHaveLength(2)
    expect(screen.queryByText(/acciones/)).toBeNull()
    expect(screen.queryByText('Completado')).toBeNull()
  })

  it('resolves an approval from its chronological row', async () => {
    const resolve = vi.fn()
    view({ ...base, status: 'approval', items: [{ id: 'approval:p1', type: 'approval', activitySeq: 1, occurredAt: 1_100, approvalId: 'p1', status: 'pending', capability: 'shell.exec', risk: 'high', description: 'Ejecutar comando' }] }, 1_200, resolve)
    await userEvent.click(screen.getByRole('button', { name: 'Permitir una vez' }))
    expect(resolve).toHaveBeenCalledWith('p1', 'allow_once')
  })

  it('shows cancelling immediately and disables pending approval controls', () => {
    view({ ...base, status: 'cancelling', items: [{ id: 'approval:p1', type: 'approval', activitySeq: 1, occurredAt: 1_100, approvalId: 'p1', status: 'resolving', capability: 'shell.exec', risk: 'high', description: 'Ejecutar comando' }] }, 1_101)
    expect(screen.getByText('Cancelando…')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Permitir una vez' }).hasAttribute('disabled')).toBe(true)
  })

  it('does not offer a reusable grant when the engine forbids it', () => {
    view({ ...base, status: 'approval', items: [{ id: 'approval:p1', type: 'approval', activitySeq: 1, occurredAt: 1_100, approvalId: 'p1', status: 'pending', capability: 'fs.write', risk: 'high', description: 'Archivo sensible', choices: ['deny', 'allow_once'], reusable: false }] }, 1_200)
    expect(screen.getByRole('button', { name: 'Permitir una vez' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Permitir en este chat' })).toBeNull()
  })

  it('a scheduled run offers to allow the capability for the whole task', async () => {
    const grant = vi.spyOn(engineApi, 'scheduleGrant').mockResolvedValue({} as never)
    const resolve = vi.fn()
    const approval = { id: 'approval:p1', type: 'approval' as const, activitySeq: 1, occurredAt: 1_100, approvalId: 'p1', status: 'pending' as const, capability: 'shell.exec', target: 'backup.ps1', risk: 'high', description: 'Ejecutar comando' }
    const rendered = view({ ...base, status: 'approval', items: [approval] }, 1_200, resolve)
    expect(screen.queryByRole('button', { name: 'Permitir para esta tarea' })).toBeNull()
    rendered.unmount()
    view({ ...base, status: 'approval', origin: { kind: 'schedule' }, items: [approval] }, 1_200, resolve)
    await userEvent.click(screen.getByRole('button', { name: 'Permitir para esta tarea' }))
    expect(grant).toHaveBeenCalledWith({ sessionId: 's1', capability: 'shell.exec', target: 'backup.ps1' })
    expect(resolve).toHaveBeenCalledWith('p1', 'allow_session')
    grant.mockRestore()
  })

  it('shows a compact per-turn changeset after the final response', () => {
    view({ ...base, status: 'completed', completedAt: 2_000, items: [
      { id: 'model:m1', type: 'model', activitySeq: 1, occurredAt: 1_500, modelCallId: 'm1', status: 'completed', content: 'Listo', outputKind: 'final' },
      { id: 'changeset:c1', type: 'changeset', activitySeq: 2, occurredAt: 1_600, changesetId: 'c1', turnId: 't1', status: 'active', additions: 2, deletions: 1, undoable: true, attributionComplete: true, warnings: [], files: [{ path: 'a.ts', absolute_path: '/repo/a.ts', kind: 'modified', additions: 2, deletions: 1, ownership: 'agent', confidence: 'exact', binary: false, sensitive: false, diff: '+ok', diff_truncated: false, undoable: true }] },
    ] }, 2_000)
    expect(screen.getByText('1 archivo(s) de este turno')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Revisar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Deshacer' })).toBeTruthy()
  })
})


it('opens an agent card with its own messages and execution context', async () => {
  view({ ...base, items: [{
    id: 'agent:a', type: 'agent', activitySeq: 1, occurredAt: 1_100,
    agentId: 'a', agent: 'explore', phase: 'started', status: 'running',
    objective: 'Inspeccionar SSH', cwd: 'C:/Proyecto', profile: 'full-access',
    items: [{ id: 'model:child', type: 'model', activitySeq: 2, occurredAt: 1_200, modelCallId: 'child', status: 'completed', content: 'Hardware encontrado', outputKind: 'progress' }],
  }] }, 1_300)
  const action = screen.getByText('Ver actividad')
  await userEvent.click(action)
  expect(action.closest('details')?.hasAttribute('open')).toBe(true)
  expect(screen.getByText('Hardware encontrado')).toBeTruthy()
  expect(screen.getByText('Inspeccionar SSH')).toBeTruthy()
  expect(screen.getByText('full-access · C:/Proyecto')).toBeTruthy()
})

// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { setPlatformForTests } from '../../platform'
import { createTestBridge, type TestBridge } from '../../platform/testBridge'
import TurnTimelineView from '../activity/TurnTimelineView'
import type { MemoryTimelineItem, TurnTimeline } from '../activity/types'
import { useActivityDisclosure } from '../../stores/activityDisclosure'
import { MemoryActivityCard } from './MemoryActivityCard'
import { resetMemoryStoreForTests } from './memoryStore'

const candidateItem: MemoryTimelineItem = {
  id: 'memory:candidate:c1', type: 'memory', memoryEvent: 'candidate', activitySeq: 2, occurredAt: 1_100,
  candidateId: 'c1', topic: 'Editor', text: 'Usa VS Code', kind: 'environment', reason: 'learned after reading content from outside this machine',
  sensitive: false, status: 'pending',
}
const rememberedItem: MemoryTimelineItem = {
  id: 'memory:remembered:m1', type: 'memory', memoryEvent: 'remembered', activitySeq: 3, occurredAt: 1_200,
  memoryId: 'm1', topic: 'Idioma', text: 'Responde en español', kind: 'preference', status: 'remembered',
}

let bridge: TestBridge
let restore: () => void

beforeEach(() => {
  bridge = createTestBridge()
  bridge.mockCommand('memory_list', () => ({ scope: 'user', records: [], count: 0 }))
  bridge.mockCommand('memory_candidates_list', () => ({ candidates: [], count: 0 }))
  bridge.mockCommand('memory_settings_get', () => ({ learned_facts: 'ask' }))
  restore = setPlatformForTests(bridge)
})
afterEach(() => { cleanup(); resetMemoryStoreForTests(); restore(); useActivityDisclosure.getState().reset() })

const view = (item: MemoryTimelineItem) => render(<I18nProvider lang="es"><MemoryActivityCard item={item} /></I18nProvider>)
const callsTo = (name: string) => bridge.calls.filter((call) => call.name === name).map((call) => call.args)

describe('propuesta de memoria en el chat', () => {
  it('Aprobar resuelve con allow_once y muestra el resultado', async () => {
    bridge.mockCommand('memory_candidate_resolve', (args) => ({ candidate: { id: args.id, status: 'accepted', memory_id: 'm7' } }))
    view(candidateItem)
    const card = screen.getByTestId('memory-candidate')
    expect(within(card).getByText('Rinari quiere recordar')).toBeTruthy()
    expect(within(card).getByText('Entorno')).toBeTruthy()
    // The Engine's English reason is said in the app language.
    expect(within(card).getByText('Lo aprendió después de leer contenido de fuera de este equipo: revísalo antes de aprobar.')).toBeTruthy()
    await userEvent.click(within(card).getByRole('button', { name: 'Aprobar' }))
    await waitFor(() => expect(callsTo('memory_candidate_resolve')).toEqual([{ id: 'c1', decision: 'allow_once' }]))
    expect((await screen.findByRole('status')).textContent).toBe('Aprobado: Rinari lo recordará.')
    expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull()
  })

  it('Editar aprueba con el texto y el tema corregidos', async () => {
    bridge.mockCommand('memory_candidate_resolve', (args) => ({ id: args.id, status: 'approved', memory_id: 'm7' }))
    view(candidateItem)
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }))
    const text = screen.getByLabelText('Qué recuerda')
    await userEvent.clear(text)
    await userEvent.type(text, 'Usa VS Code con Vim')
    const topic = screen.getByLabelText('Tema')
    await userEvent.clear(topic)
    await userEvent.type(topic, 'Editor favorito')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y aprobar' }))
    await waitFor(() => expect(callsTo('memory_candidate_resolve')).toEqual([
      { id: 'c1', decision: 'allow_once', text: 'Usa VS Code con Vim', topic: 'Editor favorito' },
    ]))
    expect(await screen.findByText('Usa VS Code con Vim')).toBeTruthy()
  })

  it('Descartar resuelve con deny y no manda ediciones', async () => {
    bridge.mockCommand('memory_candidate_resolve', (args) => ({ id: args.id, status: 'denied' }))
    view(candidateItem)
    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(callsTo('memory_candidate_resolve')).toEqual([{ id: 'c1', decision: 'deny' }]))
    expect((await screen.findByRole('status')).textContent).toBe('Descartado: no se guardó.')
  })

  it('refleja una resolución hecha en otro sitio (evento o relectura)', async () => {
    view(candidateItem)
    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeTruthy()
    await waitFor(() => expect(callsTo('memory_candidates_list')).toHaveLength(1))
    bridge.mockCommand('memory_candidates_list', () => ({ candidates: [{ id: 'c1', topic: 'Editor', text: 'Usa VS Code', kind: 'environment', status: 'denied' }], count: 1 }))
    bridge.emitEngineEvent({ type: 'event', event: 'memory.candidate.resolved', payload: { candidate_id: 'c1', status: 'denied' } })
    expect((await screen.findByRole('status')).textContent).toBe('Descartado: no se guardó.')
  })

  it('una propuesta sensible lo advierte', () => {
    view({ ...candidateItem, sensitive: true })
    expect(screen.getByText('Puede ser información sensible: solo se guarda si la apruebas.')).toBeTruthy()
  })

  it('un turno en curso explica por qué no se pudo resolver', async () => {
    bridge.mockCommand('memory_candidate_resolve', () => { throw { code: 'TURN_RUNNING', message: 'Finish active turns' } })
    view(candidateItem)
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar' }))
    await waitFor(() => expect(callsTo('memory_candidate_resolve')).toHaveLength(1))
    // Sigue pendiente: el Engine no la resolvió.
    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeTruthy()
  })
})

describe('aviso «Recordado» del modo automático', () => {
  it('Deshacer pide la revisión actual y olvida ese recuerdo', async () => {
    bridge.mockCommand('memory_get', (args) => ({ scope: 'user', record: { id: args.id, topic: 'Idioma', text: 'Responde en español', kind: 'preference', scope: 'user', revision: 4 } }))
    bridge.mockCommand('memory_forget', (args) => ({ scope: 'user', id: args.id, forgotten: true }))
    view(rememberedItem)
    expect(screen.getByTestId('memory-remembered').textContent).toContain('Recordado: Responde en español')
    await userEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    await waitFor(() => expect(callsTo('memory_forget')).toEqual([{ id: 'm1', expected_revision: 4 }]))
    expect(callsTo('memory_get')).toEqual([{ id: 'm1' }])
    expect((await screen.findByTestId('memory-remembered')).textContent).toContain('Olvidado: Responde en español')
    expect(screen.queryByRole('button', { name: 'Deshacer' })).toBeNull()
  })

  it('un recuerdo que ya no existe cuenta como olvidado', async () => {
    bridge.mockCommand('memory_get', () => { throw { code: 'NOT_FOUND', message: 'Personal memory record not found.' } })
    view(rememberedItem)
    await userEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect((await screen.findByText('Olvidado: Responde en español'))).toBeTruthy()
    expect(callsTo('memory_forget')).toEqual([])
  })
})

it('la línea del turno muestra la tarjeta fuera de la actividad plegada', () => {
  const timeline: TurnTimeline = {
    turnId: 't1', sessionId: 's1', status: 'completed', startedAt: 1_000, completedAt: 2_000, userMessage: 'Hola',
    items: [
      { id: 'model:m1', type: 'model', activitySeq: 1, occurredAt: 1_500, modelCallId: 'm1', status: 'completed', content: 'Listo', outputKind: 'final' },
      candidateItem,
    ],
  }
  render(<I18nProvider lang="es"><TurnTimelineView timeline={timeline} now={2_000} onResolveApproval={vi.fn()} /></I18nProvider>)
  expect(screen.getByTestId('memory-candidate')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Aprobar' })).toBeTruthy()
})

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { activityKey, useActivityDisclosure } from '../../stores/activityDisclosure'
import TurnTimelineView from './TurnTimelineView'
import type { ModelTimelineItem, TurnTimeline } from './types'

const model: ModelTimelineItem = { id: 'm', type: 'model', modelCallId: 'm', activitySeq: 1, occurredAt: 1000, content: 'Texto público', status: 'streaming' }
const base: TurnTimeline = { turnId: 't', sessionId: 's', status: 'running', startedAt: 1000, userMessage: 'Hola', items: [model] }
const view = (timeline = base) => <I18nProvider lang="es"><TurnTimelineView timeline={timeline} now={5000} onResolveApproval={vi.fn()} /></I18nProvider>
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Ver actividad del turno' }))
afterEach(() => { cleanup(); useActivityDisclosure.getState().reset() })

it('keeps streaming public, moves progress inside, and renders the complete final once', () => {
  const rendered = render(view())
  expect(screen.getByTestId('turn-result').textContent).toContain('Texto público')
  expect(screen.queryByRole('button', { name: 'Ver actividad del turno' })).toBeNull()
  const progress: TurnTimeline = { ...base, items: [{ ...model, outputKind: 'progress', status: 'completed' }] }
  rendered.rerender(view(progress))
  expect(screen.queryByText('Texto público')).toBeNull()
  expect(rendered.container.querySelector('[data-activity-body]')).toBeNull()
  open()
  expect(screen.getByText('Texto público')).toBeTruthy()
  rendered.rerender(view({ ...progress, status: 'completed', completedAt: 6000, items: [...progress.items, { ...model, id: 'final', modelCallId: 'final', activitySeq: 2, content: 'Respuesta completa', outputKind: 'final', status: 'completed' }] }))
  expect(screen.getByRole('button', { name: 'Ocultar actividad del turno' }).getAttribute('aria-expanded')).toBe('true')
  expect(screen.getAllByText('Respuesta completa')).toHaveLength(1)
  expect(screen.getAllByText('Ha trabajado durante 5s')).toHaveLength(1)
})

it('keeps an interrupted public answer and its error outside the folded activity', () => {
  render(view({ ...base, status: 'failed', completedAt: 5000, error: 'Conexión interrumpida' }))
  expect(screen.getByTestId('turn-result').textContent).toContain('Texto público')
  expect(screen.getByText('Respuesta incompleta')).toBeTruthy()
  expect(screen.getByRole('alert').textContent).toContain('Conexión interrumpida')
})

it('keeps public streaming text before an instruction that arrived later', () => {
  render(view({ ...base, items: [model, { id: 'steer:x', type: 'steer', steerId: 'x', content: 'Instrucción posterior', status: 'pending', activitySeq: 2, occurredAt: 2000 }] }))
  const publicText = screen.getByText('Texto público')
  expect(publicText.compareDocumentPosition(screen.getByText('Instrucción posterior')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.getAllByText('Texto público')).toHaveLength(1)
})

it('exposes a pending child approval once while its activity is unmounted', () => {
  const resolve = vi.fn()
  const timeline: TurnTimeline = { ...base, items: [{ id: 'agent:a', type: 'agent', agentId: 'a', agent: 'explore', status: 'running', phase: 'started', activitySeq: 2, occurredAt: 2000, items: [
    { id: 'approval:p', type: 'approval', approvalId: 'p', status: 'pending', capability: 'shell.exec', risk: 'high', description: 'Ejecutar', activitySeq: 3, occurredAt: 3000 },
  ] }] }
  const rendered = render(<I18nProvider lang="es"><TurnTimelineView timeline={timeline} now={5000} onResolveApproval={resolve} /></I18nProvider>)
  expect(rendered.container.querySelector('[data-activity-body]')).toBeNull()
  expect(screen.getAllByRole('button', { name: 'Permitir una vez' })).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Permitir una vez' }))
  expect(resolve).toHaveBeenCalledExactlyOnceWith('p', 'allow_once')
  open()
  expect(screen.getAllByRole('button', { name: 'Permitir una vez' })).toHaveLength(1)
})

it('keeps steering visible and earlier segments independently inspectable', () => {
  render(view({ ...base, status: 'completed', completedAt: 5000, items: [
    { ...model, outputKind: 'progress' },
    { id: 'steer:x', type: 'steer', steerId: 'x', content: 'Conserva el orden', status: 'applied', activitySeq: 2, occurredAt: 2000 },
    { ...model, id: 'm2', modelCallId: 'm2', content: 'Segundo progreso', outputKind: 'progress', activitySeq: 3 },
  ] }))
  expect(screen.getByText('Conserva el orden')).toBeTruthy()
  expect(screen.getByText('Actividad anterior')).toBeTruthy()
  const controls = screen.getAllByRole('button', { name: 'Ver actividad del turno' })
  fireEvent.click(controls[0])
  expect(screen.getByText('Texto público')).toBeTruthy()
  expect(screen.queryByText('Segundo progreso')).toBeNull()
})

it('restores nested details and reading offsets across virtualization and view remounts', () => {
  const timeline: TurnTimeline = { ...base, items: [{ id: 'tool:1', type: 'tool', toolCallId: '1', activitySeq: 1, occurredAt: 1000, tool: 'shell.exec', status: 'completed', presentation: { kind: 'command', stdout: 'a\nb\nc', command: 'echo a' } }] }
  const first = render(view(timeline))
  open()
  const detail = first.container.querySelector('details')!
  detail.open = true
  const output = first.container.querySelector<HTMLElement>('[data-inspection-scroll]')!
  Object.defineProperty(output, 'scrollHeight', { value: 1000 })
  Object.defineProperty(output, 'clientHeight', { value: 100 })
  output.scrollTop = 43
  fireEvent.scroll(output)
  first.unmount()
  const second = render(view(timeline))
  expect(screen.getByRole('button', { name: 'Ocultar actividad del turno' })).toBeTruthy()
  expect(second.container.querySelector('details')!.open).toBe(true)
  expect(second.container.querySelector<HTMLElement>('[data-inspection-scroll]')!.scrollTop).toBe(43)
  fireEvent.click(screen.getByRole('button', { name: 'Ocultar actividad del turno' }))
  expect(second.container.querySelector('pre')).toBeNull()
  open()
  expect(second.container.querySelector('details')!.open).toBe(true)
})

it('keeps large closed activity unmounted and exposes incidents without declaring the turn failed', () => {
  const items = Array.from({ length: 500 }, (_, n) => ({ id: `tool:${n}`, type: 'tool' as const, toolCallId: String(n), tool: 'shell.exec', activitySeq: n, occurredAt: n, status: n === 4 ? 'failed' as const : 'completed' as const, presentation: { kind: 'command' as const, stdout: 'verbose output '.repeat(100) } }))
  const rendered = render(view({ ...base, status: 'completed', completedAt: 5000, items }))
  expect(rendered.container.querySelectorAll('*').length).toBeLessThan(70)
  expect(screen.getByText('Ha trabajado durante 4s')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /incidencia/ }))
  expect(rendered.container.querySelectorAll('pre').length).toBe(500)
})

it('isolates home/session keys and clears discarded runtime without persisting', () => {
  const store = useActivityDisclosure.getState()
  const one = activityKey('a', 's', 't', 'initial')
  const two = activityKey('b', 's2', 't', 'initial')
  store.setOpen(one, true); store.setOpen(two, true)
  store.forgetSession('s')
  expect(useActivityDisclosure.getState().entries[one]).toBeUndefined()
  expect(useActivityDisclosure.getState().entries[two].open).toBe(true)
  store.reset()
  expect(useActivityDisclosure.getState().entries).toEqual({})
})

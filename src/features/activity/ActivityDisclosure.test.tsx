// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { activityKey, useActivityDisclosure } from '../../stores/activityDisclosure'
import TurnTimelineView from './TurnTimelineView'
import type { ModelTimelineItem, ToolTimelineItem, TurnTimeline } from './types'

const model: ModelTimelineItem = { id: 'm', type: 'model', modelCallId: 'm', activitySeq: 1, occurredAt: 1000, content: 'Texto público', status: 'streaming' }
const base: TurnTimeline = { turnId: 't', sessionId: 's', status: 'running', startedAt: 1000, userMessage: 'Hola', items: [model] }
const view = (timeline = base) => <I18nProvider lang="es"><TurnTimelineView timeline={timeline} now={5000} onResolveApproval={vi.fn()} /></I18nProvider>
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Ver actividad del turno' }))
afterEach(() => { cleanup(); useActivityDisclosure.getState().reset() })

const workingTool: ToolTimelineItem = { id: 'tool:live', type: 'tool', toolCallId: 'live', tool: 'shell.exec', status: 'running', activitySeq: 3, occurredAt: 2000 }

it('animates active summaries, keeps public text and finished operations still, and preserves inspection on deltas', () => {
  const done: ToolTimelineItem = { ...workingTool, id: 'tool:done', toolCallId: 'done', status: 'completed', activitySeq: 2 }
  const timeline = { ...base, items: [model, done, workingTool] }
  const rendered = render(view(timeline))
  const group = screen.getByText('Comandos · 2')
  expect(group.classList.contains('activity-text-shimmer')).toBe(true)
  expect(screen.getByText('Texto público').closest('.activity-text-shimmer')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Ver operaciones' }))
  const rows = rendered.container.querySelectorAll('details > summary')
  expect(rows[0].querySelector('.activity-text-shimmer')).toBeNull()
  expect(rows[1].querySelector('.activity-text-shimmer')).not.toBeNull()
  fireEvent.click(rows[1])
  rendered.rerender(view({ ...timeline, items: [model, done, { ...workingTool, result: 'Output delta' }] }))
  expect(screen.getByText('Comandos · 2')).toBe(group)
  expect(rendered.container.querySelectorAll('details')[1].open).toBe(true)
  rendered.rerender(view({ ...timeline, items: [model, done, { ...workingTool, status: 'completed' }] }))
  expect(group.classList.contains('activity-text-shimmer')).toBe(false)
})

it.each(['completed', 'failed', 'cancelled', 'stopped', 'cancelling', 'approval'] as const)('does not animate %s even if an operation still has a running snapshot', status => {
  const rendered = render(view({ ...base, status, items: [workingTool] }))
  const summary = screen.queryByRole('button', { name: 'Ver actividad del turno' })
  if (summary) fireEvent.click(summary)
  expect(rendered.container.querySelector('.activity-text-shimmer')).toBeNull()
})

it('stops motion while a subagent approval is pending and resumes after it is resolved', () => {
  const agent = { id: 'a', type: 'agent' as const, agentId: 'a', agent: 'explore', status: 'running' as const, phase: 'started' as const, activitySeq: 2, occurredAt: 2000, items: [
    { id: 'p', type: 'approval' as const, approvalId: 'p', status: 'pending' as const, capability: 'shell.exec', risk: 'high', description: 'Ejecutar', activitySeq: 3, occurredAt: 3000 },
  ] }
  const rendered = render(view({ ...base, items: [workingTool, agent] }))
  expect(rendered.container.querySelector('.activity-text-shimmer')).toBeNull()
  expect(screen.getByRole('button', { name: 'Permitir una vez' })).toBeTruthy()
  rendered.rerender(view({ ...base, items: [workingTool, { ...agent, items: [{ ...agent.items[0], status: 'allowed' }] }] }))
  expect(rendered.container.querySelector('.activity-text-shimmer')).not.toBeNull()
})

it('keeps progress in place until completion and renders the final once', () => {
  const rendered = render(view())
  const publicNode = screen.getByText('Texto público')
  expect(screen.getByText('En proceso desde hace 4s')).toBeTruthy()
  expect(screen.queryByTestId('turn-result')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Ver actividad del turno' })).toBeNull()
  const progress: TurnTimeline = { ...base, items: [{ ...model, outputKind: 'progress', status: 'completed' }] }
  rendered.rerender(view(progress))
  expect(screen.getByText('Texto público')).toBe(publicNode)
  rendered.rerender(view({ ...progress, status: 'completed', completedAt: 6000, items: [...progress.items, { ...model, id: 'final', modelCallId: 'final', activitySeq: 2, content: 'Respuesta completa', outputKind: 'final', status: 'completed' }] }))
  expect(screen.queryByText('Texto público')).toBeNull()
  expect(screen.getAllByText('Respuesta completa')).toHaveLength(1)
  expect(screen.getAllByText('Ha trabajado durante 5s')).toHaveLength(1)
  open()
  expect(screen.getByText('Texto público')).toBeTruthy()
})

it('moves final classification to the canonical result without duplication', () => {
  const rendered = render(view())
  rendered.rerender(view({ ...base, items: [{ ...model, outputKind: 'final', status: 'completed' }] }))
  expect(screen.getAllByText('Texto público')).toHaveLength(1)
  expect(screen.getByTestId('turn-result').textContent).toContain('Texto público')
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
  fireEvent.click(screen.getByText('Ver actividad'))
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

it.each(['completed', 'failed', 'cancelled', 'stopped'] as const)('folds on %s, restores inspection, and ignores late events for manual opening', status => {
  const timeline: TurnTimeline = { ...base, items: [
    { ...model, outputKind: 'progress' },
    { id: 'tool:1', type: 'tool', toolCallId: '1', activitySeq: 2, occurredAt: 1000, tool: 'shell.exec', status: 'completed', presentation: { kind: 'command', stdout: 'a\nb\nc', command: 'echo a' } },
  ] }
  const first = render(view(timeline))
  fireEvent.click(first.container.querySelector('details > summary')!)
  const output = first.container.querySelector<HTMLElement>('[data-inspection-scroll]')!
  Object.defineProperty(output, 'scrollHeight', { value: 1000 })
  Object.defineProperty(output, 'clientHeight', { value: 100 })
  output.scrollTop = 43
  fireEvent.scroll(output)
  first.unmount()
  const second = render(view(timeline))
  expect(second.container.querySelector('details')!.open).toBe(true)
  expect(second.container.querySelector<HTMLElement>('[data-inspection-scroll]')!.scrollTop).toBe(43)
  const terminal = { ...timeline, status, completedAt: 6000 }
  second.rerender(view(terminal))
  expect(second.container.querySelector('pre')).toBeNull()
  expect(screen.queryByText('Texto público')).toBeNull()
  open()
  expect(second.container.querySelector('details')!.open).toBe(true)
  expect(second.container.querySelector<HTMLElement>('[data-inspection-scroll]')!.scrollTop).toBe(43)
  second.rerender(view({ ...terminal, items: [...terminal.items, { ...model, id: 'late', content: 'Evento tardío', outputKind: 'progress', activitySeq: 3 }] }))
  expect(screen.getByText('Evento tardío')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Ocultar actividad del turno' })).toBeTruthy()
})

it('groups consecutive mixed operations between public messages with lazy details', () => {
  const tool = (id: string, name: string) => ({ id, type: 'tool' as const, toolCallId: id, activitySeq: 2, occurredAt: 2000, tool: name, status: 'completed' as const, result: 'OUTPUT ' + id })
  const rendered = render(view({ ...base, items: [model, tool('a', 'shell.exec'), tool('b', 'fs.read'), { ...model, id: 'm2', content: 'Después', outputKind: 'progress' }, tool('c', 'fs.glob')] }))
  expect(screen.getByText('Texto público').compareDocumentPosition(screen.getByText('Después')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.getByText('Comandos · Lecturas · 2')).toBeTruthy()
  expect(rendered.container.querySelectorAll('pre')).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'Ver operaciones' }))
  expect(rendered.container.querySelectorAll('pre')).toHaveLength(0)
  fireEvent.click(rendered.container.querySelector('details > summary')!)
  expect(screen.getByText('OUTPUT a')).toBeTruthy()
})

it('keeps large closed activity unmounted and exposes incidents without declaring the turn failed', () => {
  const items = Array.from({ length: 500 }, (_, n) => ({ id: `tool:${n}`, type: 'tool' as const, toolCallId: String(n), tool: 'shell.exec', activitySeq: n, occurredAt: n, status: n === 4 ? 'failed' as const : 'completed' as const, presentation: { kind: 'command' as const, stdout: 'verbose output '.repeat(100) } }))
  const rendered = render(view({ ...base, status: 'completed', completedAt: 5000, items }))
  expect(rendered.container.querySelectorAll('*').length).toBeLessThan(70)
  expect(screen.getByText('Ha trabajado durante 4s')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /incidencia/ }))
  expect(rendered.container.querySelectorAll('pre').length).toBe(0)
  fireEvent.click(screen.getByRole('button', { name: 'Ver operaciones' }))
  expect(rendered.container.querySelectorAll('details').length).toBe(500)
  expect(rendered.container.querySelectorAll('pre').length).toBe(0)
  fireEvent.click(rendered.container.querySelectorAll('details > summary')[4])
  expect(rendered.container.querySelectorAll('pre').length).toBe(1)
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

it('keeps an inspected operation open when its consecutive group grows', () => {
  const tool = { id: 'a', type: 'tool' as const, toolCallId: 'a', activitySeq: 1, occurredAt: 1000, tool: 'shell.exec', status: 'running' as const, result: 'Salida inicial' }
  const rendered = render(view({ ...base, items: [tool] }))
  fireEvent.click(rendered.container.querySelector('summary')!)
  expect(screen.getByText('Salida inicial')).toBeTruthy()
  rendered.rerender(view({ ...base, items: [tool, { ...tool, id: 'b', toolCallId: 'b', activitySeq: 2, result: 'Segunda salida' }] }))
  expect(screen.getByRole('button', { name: 'Ocultar operaciones' })).toBeTruthy()
  expect(screen.getByText('Salida inicial')).toBeTruthy()
  expect(screen.queryByText('Segunda salida')).toBeNull()
})


it('restores a paused subagent without resuming its follow on remount', async () => {
  const agent = { id: 'agent:a', type: 'agent' as const, agentId: 'a', agent: 'explore', phase: 'started' as const, status: 'running' as const, activitySeq: 2, occurredAt: 2000, items: [model] }
  const first = render(view({ ...base, items: [agent] }))
  fireEvent.click(screen.getByText('Ver actividad'))
  const box = screen.getByTestId('agent-activity')
  Object.defineProperty(box, 'scrollHeight', { value: 1000 })
  Object.defineProperty(box, 'clientHeight', { value: 100 })
  box.scrollTop = 43
  fireEvent.scroll(box)
  first.unmount()
  const second = render(view({ ...base, items: [agent] }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ir al final' })).toBeTruthy())
  const restored = screen.getByTestId('agent-activity')
  expect(restored.scrollTop).toBe(43)
  second.rerender(view({ ...base, items: [{ ...agent, items: [model, { ...model, id: 'later', content: 'Nuevo avance' }] }] }))
  expect(restored.scrollTop).toBe(43)
})

it('keeps pending questions still without hiding their surrounding public progress', () => {
  const rendered = render(view({ ...base, items: [model, workingTool, {
    id: 'q', type: 'question', activitySeq: 4, occurredAt: 3000,
    request: { request_id: 'q', session_id: 's', turn_id: 't', status: 'pending', questions: [] },
  }] }))
  expect(rendered.container.querySelector('.activity-text-shimmer')).toBeNull()
  expect(screen.getByText('Texto público')).toBeTruthy()
})

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import TurnTimelineView from './TurnTimelineView'
import { useActivityDisclosure } from '../../stores/activityDisclosure'
import type { ToolPresentation, TurnTimeline } from './types'

afterEach(() => { cleanup(); useActivityDisclosure.getState().reset() })

function show(presentation: ToolPresentation) {
  const timeline: TurnTimeline = {
    turnId: 'review-turn', sessionId: 'review-session', status: 'completed',
    startedAt: 1000, completedAt: 2000, userMessage: 'Prueba',
    items: [{ id: 'tool:review', type: 'tool', tool: 'shell.exec',
      toolCallId: 'review', activitySeq: 1, occurredAt: 1100,
      status: presentation.status === 'failed' ? 'failed' : 'completed',
      durationMs: 500, presentation }],
  }
  const rendered = render(<I18nProvider lang="es"><TurnTimelineView timeline={timeline} now={2000} onResolveApproval={vi.fn()} onContinue={vi.fn()} /></I18nProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Ver actividad del turno' }))
  fireEvent.click(rendered.container.querySelector('details > summary')!)
  return rendered
}

it('preserves output newlines and separates stderr from stdout', () => {
  const { container } = show({ kind: 'command', command: 'echo prueba',
    cwd: 'C:\\Proyecto con espacios', exit_code: 0, status: 'success',
    stdout: 'Primera línea\nMañana', stderr: 'Aviso independiente', stderr_warning: true })
  const outputs = [...container.querySelectorAll('pre')].map(node => node.textContent)
  expect(outputs).toContain('Primera línea\nMañana')
  expect(outputs).toContain('Aviso independiente')
  expect(container.textContent).not.toContain('PS&gt;')
  expect(container.textContent).toContain('PS>')
})

it('makes timeout errors visible even when the command produced no output', () => {
  show({ kind: 'command', command: 'slow-command', status: 'failed', stdout: '', stderr: '',
    error: { code: 'TIMEOUT', message: 'Se agotó el tiempo de ejecución', retryable: true } })
  expect(screen.getByText('Se agotó el tiempo de ejecución')).toBeTruthy()
})

it('does not interpret HTML from process output', () => {
  const text = '<img src=x onerror="alert(1)">'
  const { container } = show({ kind: 'command', command: 'echo', status: 'success', stdout: text })
  expect(container.querySelector('pre')?.parentElement).toBeTruthy()
  expect(container.textContent).toContain(text)
  // The avatar of the live header is an <img>; the process output must not add one.
  expect(container.querySelector('img[src="x"]')).toBeNull()
})

it('renders structured results for tools without a model observation string', () => {
  const { container } = show({ kind: 'tool', status: 'success', data: {
    files: ['mañana.txt', 'café.md'], count: 2,
  } })
  expect(container.textContent).toContain('mañana.txt')
  expect(container.textContent).toContain('café.md')
})

// @vitest-environment jsdom
// #68: una herramienta que falla dice la causa en el idioma de la app por su
// código; el texto del Engine (en inglés, con la ruta) queda como detalle.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import TurnTimelineView from './TurnTimelineView'
import { useActivityDisclosure } from '../../stores/activityDisclosure'
import type { TurnTimeline } from './types'

afterEach(() => { cleanup(); useActivityDisclosure.getState().reset() })

function show(errorCode?: string) {
  const timeline: TurnTimeline = {
    turnId: 't', sessionId: 's', status: 'completed', startedAt: 1000, completedAt: 2000, userMessage: 'Lee el archivo',
    items: [{ id: 'tool:r', type: 'tool', tool: 'fs.read', toolCallId: 'r', activitySeq: 1, occurredAt: 1100,
      status: 'failed', durationMs: 20, error: 'File not found: src/missing.ts', errorCode }],
  }
  const rendered = render(<I18nProvider lang="es"><TurnTimelineView timeline={timeline} now={2000} onResolveApproval={vi.fn()} onContinue={vi.fn()} /></I18nProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Ver actividad del turno' }))
  fireEvent.click(rendered.container.querySelector('details > summary')!)
  return rendered
}

it('a known code says the cause in Spanish and keeps the engine text as the detail', () => {
  show('NOT_FOUND')
  expect(screen.getByTestId('tool-cause').textContent).toBe('No se encontró lo que buscaba (archivo, carpeta o recurso).')
  expect(screen.getByText('File not found: src/missing.ts')).toBeTruthy()
})

it('an unknown or missing code adds nothing', () => {
  show('SOMETHING_NEW')
  expect(screen.queryByTestId('tool-cause')).toBeNull()
})

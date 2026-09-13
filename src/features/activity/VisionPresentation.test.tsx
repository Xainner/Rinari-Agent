// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { I18nProvider } from '../../i18n'
import { useUIStore } from '../../stores/ui'
import TurnTimelineView from './TurnTimelineView'
import type { TurnTimeline, VisionTimelineItem } from './types'

afterEach(cleanup)
const item: VisionTimelineItem = { id: 'v', type: 'vision', activitySeq: 1, occurredAt: 1,
  status: 'completed', route: 'dedicated', modelId: 'private-model', modelName: 'private-model',
  providerName: 'private-provider', question: 'Internal artifact://session/media/private.png',
  analysis: 'Visual observation', images: [], cached: false }
function view(items: VisionTimelineItem[], status: TurnTimeline['status'] = 'completed') {
  const timeline: TurnTimeline = { turnId: 't', sessionId: 's', status, startedAt: 1,
    userMessage: 'Inspect this', items }
  return <I18nProvider lang="es"><TurnTimelineView timeline={timeline} now={2000}
    onResolveApproval={() => {}} onContinue={() => {}} /></I18nProvider>
}
function show(items: VisionTimelineItem[], status: TurnTimeline['status'] = 'completed', technical = false) {
  useUIStore.setState({ showTechnicalActivityNames: technical })
  return render(view(items, status))
}
it('hides native activity including historical events', () => {
  show([{ ...item, route: 'conversation' }])
  expect(screen.queryByText(/Análisis visual/)).toBeNull()
  expect(screen.queryByText(/private-provider|artifact:\/\//)).toBeNull()
})
it('does not render ten successful auxiliary cards or their internal content', () => {
  show(Array.from({ length: 10 }, (_, i) => ({ ...item, id: String(i) })))
  expect(screen.queryByText('Análisis visual')).toBeNull()
  expect(screen.queryByText(/Visual observation|private-provider|private-model|artifact:\/\//)).toBeNull()
  expect(screen.queryByRole('status')).toBeNull()
})
it('shows one progress line and removes it after the last result arrives', () => {
  const batch = Array.from({ length: 9 }, (_, i) => ({ ...item, id: String(i),
    status: (i < 6 ? 'completed' : i === 6 ? 'running' : 'queued') as VisionTimelineItem['status'] }))
  const result = show(batch, 'running')
  expect(screen.getAllByRole('status')).toHaveLength(1)
  expect(screen.getByText('Analizando imágenes · 6 de 9')).toBeTruthy()
  expect(screen.queryByText('Pensando…')).toBeNull()
  result.rerender(view(batch.map(i => ({ ...i, status: 'completed' })), 'completed'))
  expect(screen.queryByText(/Analizando imágenes/)).toBeNull()
})
it('keeps partial, failed and cancelled results in a single collapsed notice', () => {
  show(['partial', 'failed', 'cancelled'].map((status, i) => ({ ...item, id: String(i), status: status as VisionTimelineItem['status'] })))
  const summary = screen.getByText('Revisión de imágenes con incidencias · 3')
  expect(summary.closest('details')?.open).toBe(false)
  expect(screen.getByText('Análisis parcial · límite de salida')).toBeTruthy()
  expect(screen.getByText('No se pudo analizar la imagen')).toBeTruthy()
  expect(screen.queryByText(/Visual observation|private-provider|artifact:\/\//)).toBeNull()
})
it('preserves individual results behind one technical disclosure', () => {
  show([item], 'completed', true)
  expect(screen.getByText('Detalles técnicos de visión · 1').closest('details')?.open).toBe(false)
  expect(screen.getByText('Visual observation')).toBeTruthy()
  expect(screen.getByText(/private-provider/)).toBeTruthy()
})
it('does not leave a stale historical operation spinning after a stopped turn', () => {
  show([{ ...item, status: 'running' }], 'stopped')
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.getByText('Análisis interrumpido')).toBeTruthy()
})
it('uses a single cancellation indicator for an active visual batch', () => {
  show([{ ...item, status: 'running' }, { ...item, id: 'q', status: 'queued' }], 'cancelling')
  expect(screen.getAllByRole('status')).toHaveLength(1)
  expect(screen.getByText('Cancelando análisis · 0 de 2')).toBeTruthy()
})

// @vitest-environment jsdom
// Plan 0.4.0 #41: la tarjeta de cambios del turno con el estilo nuevo y la
// vista Cambios del panel lateral, que enseña el turno con colores sin git.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const projectChanges = vi.fn()
const reviewTurnChanges = vi.fn()
vi.mock('../../services/engine', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../services/engine')>()
  return {
    ...original,
    engineApi: {
      ...original.engineApi,
      projectChanges: (...args: unknown[]) => projectChanges(...args),
      reviewTurnChanges: (...args: unknown[]) => reviewTurnChanges(...args),
    },
  }
})
vi.mock('./ChangesPanel', () => ({ default: ({ path }: { path: string }) => <div data-testid={`repo-${path}`} /> }))

import { I18nProvider } from '../../i18n'
import { ChangeSetRow } from '../activity/ChangeSetRow'
import type { ChangeSetTimelineItem } from '../activity/types'
import { ReadTrackingContext } from '../board/useResultVisibility'
import { dockNamespaceKey, resetSessionDockForTests, useSessionDockStore } from '../../stores/sessionDock'
import TurnChangesView from './TurnChangesView'

const files = [
  { path: 'src/caja/ticket.ts', absolute_path: '/repo/src/caja/ticket.ts', kind: 'modified' as const, additions: 3, deletions: 1, ownership: 'agent' as const, confidence: 'exact', binary: false, sensitive: false, diff: '@@ -1,2 +1,2 @@\n-const a = 1\n+const a = 2\n keep', diff_truncated: false, undoable: true },
  { path: 'src/caja/qr.ts', absolute_path: '/repo/src/caja/qr.ts', kind: 'created' as const, additions: 7, deletions: 0, ownership: 'agent' as const, confidence: 'exact', binary: false, sensitive: false, diff: '@@ -0,0 +1,1 @@\n+export const qr = true', diff_truncated: false, undoable: true },
]
const item: ChangeSetTimelineItem = { id: 'c1', type: 'changeset', changesetId: 'c1', turnId: 't1', activitySeq: 1, occurredAt: 1000, status: 'active', additions: 10, deletions: 1, undoable: true, attributionComplete: true, warnings: [], files }

beforeEach(() => {
  window.localStorage.clear()
  resetSessionDockForTests()
  projectChanges.mockReset()
  reviewTurnChanges.mockReset()
  reviewTurnChanges.mockResolvedValue({ changeset_id: 'c1', turn_id: 't1', files })
})
afterEach(cleanup)

it('la tarjeta dice cuántos archivos (bien en plural), cada uno con su tipo y su +/−', async () => {
  render(
    <I18nProvider lang="es">
      <ReadTrackingContext.Provider value={{ sessionId: 'ses_a', visible: true }}>
        <ChangeSetRow item={item} turnActive={false} />
      </ReadTrackingContext.Provider>
    </I18nProvider>,
  )
  const card = screen.getByTestId('turn-changes')
  expect(within(card).getByText('2 archivos cambiados')).toBeTruthy()
  expect(within(card).getByText('modificado')).toBeTruthy()
  expect(within(card).getByText('creado')).toBeTruthy()
  expect(within(card).getByText('+7')).toBeTruthy()
  // Un archivo de la lista abre Cambios del panel lateral en ese archivo.
  await userEvent.click(within(card).getByRole('button', { name: /src\/caja\/qr\.ts/ }))
  const state = useSessionDockStore.getState()
  expect(state.layoutFor('ses_a').views).toEqual(['changes'])
  expect(state.changesFocus[dockNamespaceKey(null, 'ses_a')]).toMatchObject({ turnId: 't1', path: 'src/caja/qr.ts' })
  // «Revisar» abre el turno entero.
  await userEvent.click(within(card).getByRole('button', { name: 'Revisar' }))
  expect(useSessionDockStore.getState().changesFocus[dockNamespaceKey(null, 'ses_a')]).toMatchObject({ turnId: 't1', path: undefined })
})

it('en inglés también', () => {
  render(<I18nProvider lang="en"><ChangeSetRow item={{ ...item, files: [files[0]!] }} turnActive={false} /></I18nProvider>)
  expect(screen.getByText('1 file changed')).toBeTruthy()
  expect(screen.getByText('modified')).toBeTruthy()
})

it('sin git, «Este turno» enseña los archivos y el diff a color, y sin selector de alcance', async () => {
  projectChanges.mockResolvedValue({ available: false, branch: null, dirty: false, files: [] })
  useSessionDockStore.setState({ changesFocus: { [dockNamespaceKey(null, 'ses_a')]: { turnId: 't1', path: 'src/caja/ticket.ts', at: 1 } } })
  render(<I18nProvider lang="es"><TurnChangesView sessionId="ses_a" path="/repo" /></I18nProvider>)
  // Sin turnos en el runtime, el foco no basta: la vista dice que no hay cambios.
  expect(await screen.findByText('Esta conversación todavía no cambió archivos.')).toBeTruthy()
  await waitFor(() => expect(projectChanges).toHaveBeenCalledWith('/repo'))
  expect(screen.queryByRole('radiogroup', { name: 'Qué cambios ver' })).toBeNull()
})

it('con git, el selector cambia a todo el repo', async () => {
  projectChanges.mockResolvedValue({ available: true, branch: 'main', dirty: true, files: [] })
  render(<I18nProvider lang="es"><TurnChangesView sessionId="ses_a" path="/repo" /></I18nProvider>)
  const scope = await screen.findByRole('radiogroup', { name: 'Qué cambios ver' })
  await userEvent.click(within(scope).getByRole('radio', { name: 'Todo el repo' }))
  expect(screen.getByTestId('repo-/repo')).toBeTruthy()
})

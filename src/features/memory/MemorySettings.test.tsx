// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { I18nProvider } from '../../i18n'
import { setPlatformForTests } from '../../platform'
import { createTestBridge, type TestBridge } from '../../platform/testBridge'
import MemorySettings from './MemorySettings'
import { resetMemoryStoreForTests } from './memoryStore'
import type { MemoryRecord } from './types'

const records: MemoryRecord[] = [
  { id: 'm1', topic: 'Idioma', text: 'Responde en español', kind: 'preference', scope: 'user', revision: 2, updated_at: '2026-10-01T10:00:00Z' },
  { id: 'm2', topic: 'Sistema', text: 'Trabaja en Windows 11', kind: 'environment', scope: 'user', revision: 1 },
  { id: 'm3', topic: 'Pruebas', text: 'Corre vitest antes de commitear', kind: 'workflow', scope: 'user', revision: 5 },
]
const pending = { id: 'c1', session_id: 's1', topic: 'Editor', text: 'Usa VS Code', kind: 'environment', scope: 'user', reason: 'Lo mencionaste', sensitive: false, status: 'pending', created_at: '2026-10-08T10:00:00Z' }

let bridge: TestBridge
let restore: () => void
let stored: MemoryRecord[]
let candidates: Array<typeof pending>
let learned: 'ask' | 'auto'

beforeEach(() => {
  stored = records.map((record) => ({ ...record }))
  candidates = [{ ...pending }]
  learned = 'ask'
  bridge = createTestBridge()
  bridge.mockCommand('memory_list', () => ({ scope: 'user', records: stored, count: stored.length }))
  bridge.mockCommand('memory_candidates_list', () => ({ candidates, count: candidates.length }))
  bridge.mockCommand('memory_settings_get', () => ({ learned_facts: learned }))
  bridge.mockCommand('memory_settings_set', (args) => { learned = args.learned_facts as 'ask' | 'auto'; return { learned_facts: learned } })
  restore = setPlatformForTests(bridge)
})
afterEach(() => { cleanup(); resetMemoryStoreForTests(); restore() })

const view = () => render(<I18nProvider lang="es"><MemorySettings /></I18nProvider>)
const callsTo = (name: string) => bridge.calls.filter((call) => call.name === name).map((call) => call.args)

it('muestra propuestas pendientes, el ajuste y lo que Rinari recuerda', async () => {
  view()
  expect(await screen.findByText('Responde en español')).toBeTruthy()
  const proposals = screen.getByRole('heading', { name: 'Propuestas pendientes' }).closest('section') as HTMLElement
  expect(within(proposals).getByText('Usa VS Code')).toBeTruthy()
  expect(screen.getByRole('radio', { name: /Preguntar/ }).getAttribute('aria-checked')).toBe('true')
  expect(screen.getByText('Lo que le pides explícitamente que recuerde se guarda siempre.')).toBeTruthy()
  expect(screen.getAllByTestId('memory-record')).toHaveLength(3)
  // Filtro por tipo: Entorno, Flujo de trabajo, Preferencia, Dato.
  const filter = screen.getByRole('radiogroup', { name: 'Filtrar por tipo' })
  await userEvent.click(within(filter).getByRole('radio', { name: 'Flujo de trabajo' }))
  expect(screen.getAllByTestId('memory-record').map((row) => row.textContent)).toEqual([expect.stringContaining('Corre vitest')])
  await userEvent.click(within(filter).getByRole('radio', { name: 'Dato' }))
  expect(screen.getByText('No hay recuerdos de este tipo.')).toBeTruthy()
})

it('cambia lo que Rinari aprende por su cuenta', async () => {
  view()
  const auto = await screen.findByRole('radio', { name: /Automático/ })
  await waitFor(() => expect((auto as HTMLButtonElement).disabled).toBe(false))
  await userEvent.click(auto)
  await waitFor(() => expect(callsTo('memory_settings_set')).toEqual([{ learned_facts: 'auto' }]))
  await waitFor(() => expect(auto.getAttribute('aria-checked')).toBe('true'))
})

it('aprueba una propuesta con el texto editado y la saca de pendientes', async () => {
  bridge.mockCommand('memory_candidate_resolve', (args) => {
    candidates = [{ ...pending, status: 'accepted', text: String(args.text) }]
    stored = [...stored, { id: 'm4', topic: 'Editor', text: String(args.text), kind: 'environment', scope: 'user', revision: 1 }]
    return { candidate: candidates[0] }
  })
  view()
  const proposals = (await screen.findByRole('heading', { name: 'Propuestas pendientes' })).closest('section') as HTMLElement
  await userEvent.click(within(proposals).getByRole('button', { name: 'Editar' }))
  const text = within(proposals).getByLabelText('Qué recuerda')
  await userEvent.clear(text)
  await userEvent.type(text, 'Usa VS Code Insiders')
  await userEvent.click(within(proposals).getByRole('button', { name: 'Guardar y aprobar' }))
  await waitFor(() => expect(callsTo('memory_candidate_resolve')).toEqual([{ id: 'c1', decision: 'allow_once', text: 'Usa VS Code Insiders' }]))
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Propuestas pendientes' })).toBeNull())
  expect(await screen.findByText('Usa VS Code Insiders')).toBeTruthy()
})

it('olvida un recuerdo solo tras confirmarlo, con su revisión', async () => {
  bridge.mockCommand('memory_forget', (args) => {
    stored = stored.filter((record) => record.id !== args.id)
    return { scope: 'user', id: args.id, forgotten: true }
  })
  view()
  await userEvent.click(await screen.findByRole('button', { name: 'Olvidar «Idioma»' }))
  const dialog = await screen.findByRole('alertdialog')
  expect(within(dialog).getByText('Rinari dejará de recordar «Responde en español». No se puede deshacer.')).toBeTruthy()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
  expect(callsTo('memory_forget')).toEqual([])
  await userEvent.click(screen.getByRole('button', { name: 'Olvidar «Idioma»' }))
  await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Olvidar' }))
  await waitFor(() => expect(callsTo('memory_forget')).toEqual([{ id: 'm1', expected_revision: 2 }]))
  await waitFor(() => expect(screen.queryByText('Responde en español')).toBeNull())
})

it('edita con concurrencia optimista y, ante un conflicto, relee la versión actual', async () => {
  bridge.mockCommand('memory_update', () => {
    stored = stored.map((record) => (record.id === 'm2' ? { ...record, text: 'Trabaja en Windows 11 y WSL', revision: 2 } : record))
    throw { code: 'CONFLICT', message: 'Memory revision changed.' }
  })
  view()
  await userEvent.click(await screen.findByRole('button', { name: 'Editar «Sistema»' }))
  const text = screen.getByLabelText('Qué recuerda')
  await userEvent.clear(text)
  await userEvent.type(text, 'Trabaja en Linux')
  const listsBefore = callsTo('memory_list').length
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(callsTo('memory_update')).toEqual([{ id: 'm2', expected_revision: 1, text: 'Trabaja en Linux' }]))
  await waitFor(() => expect(callsTo('memory_list').length).toBeGreaterThan(listsBefore))
  expect(await screen.findByText('Trabaja en Windows 11 y WSL')).toBeTruthy()
})

it('busca en el Engine y explica una búsqueda sin resultados', async () => {
  bridge.mockCommand('memory_search', (args) => ({ scope: 'user', query: args.query, records: [], count: 0 }))
  view()
  await screen.findByText('Responde en español')
  await userEvent.type(screen.getByLabelText('Buscar en la memoria'), 'gatos')
  expect(await screen.findByText('Nada coincide con la búsqueda.')).toBeTruthy()
  expect(callsTo('memory_search').at(-1)).toEqual({ query: 'gatos', scope: 'all' })
})

it('sin recuerdos ni propuestas muestra el estado vacío', async () => {
  stored = []
  candidates = []
  view()
  expect(await screen.findByText('Rinari todavía no recuerda nada de ti.')).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Propuestas pendientes' })).toBeNull()
})

it('informa un fallo de carga y permite reintentar', async () => {
  bridge.mockCommand('memory_list', () => { throw { code: 'ENGINE_UNAVAILABLE', message: 'engine offline' } })
  view()
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toContain('engine offline')
  bridge.mockCommand('memory_list', () => ({ scope: 'user', records: stored, count: stored.length }))
  await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByText('Responde en español')).toBeTruthy()
})

it('un Engine sin memory.settings deja el ajuste desactivado y lo explica', async () => {
  bridge.mockCommand('memory_settings_get', () => { throw { code: 'METHOD_NOT_FOUND', message: 'unknown method' } })
  view()
  expect(await screen.findByText('Este Engine todavía no permite cambiar este ajuste.')).toBeTruthy()
  expect((screen.getByRole('radio', { name: /Automático/ }) as HTMLButtonElement).disabled).toBe(true)
})

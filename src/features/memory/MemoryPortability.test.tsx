// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { I18nProvider } from '../../i18n'
import { setPlatformForTests } from '../../platform'
import { createTestBridge, type TestBridge } from '../../platform/testBridge'
import MemorySettings from './MemorySettings'
import { resetMemoryStoreForTests } from './memoryStore'
import type { MemoryImportSummary } from './types'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }))

const bundle = { format: 'rinari-memory', version: 1, records: [{ scope: 'user', text: 'Responde en español' }], suppressions: [] }
const digest = 'a'.repeat(64)
const summary = (patch: Partial<MemoryImportSummary> = {}): MemoryImportSummary => ({
  dry_run: true,
  total: 4,
  imported: 2,
  skipped_duplicates: 1,
  skipped_suppressed: 1,
  skipped_conflicts: 0,
  rejected: 0,
  sensitive: 0,
  suppressions_added: 0,
  ...patch,
})

let bridge: TestBridge
let restore: () => void

beforeEach(() => {
  bridge = createTestBridge()
  bridge.mockCommand('memory_list', () => ({ scope: 'all', records: [], count: 0 }))
  bridge.mockCommand('memory_candidates_list', () => ({ candidates: [], count: 0 }))
  bridge.mockCommand('memory_settings_get', () => ({ learned_facts: 'ask' }))
  bridge.mockCommand('memory_export', () => ({ bundle, digest, count: 1 }))
  bridge.mockCommand('memory_import', (args) => summary({ dry_run: Boolean(args.dry_run) }))
  restore = setPlatformForTests(bridge)
})
afterEach(() => { cleanup(); resetMemoryStoreForTests(); restore(); vi.clearAllMocks() })

const view = () => render(<I18nProvider lang="es"><MemorySettings /></I18nProvider>)
const callsTo = (name: string) => bridge.calls.filter((call) => call.name === name).map((call) => call.args)
const section = async () => (await screen.findByRole('heading', { name: 'Exportar e importar' })).closest('section') as HTMLElement
const file = (contents: unknown) => ({ name: 'rinari-memory-2026-10-09.json', contents: typeof contents === 'string' ? contents : JSON.stringify(contents) })

it('exporta el paquete del Engine a un .json que elige la persona', async () => {
  view()
  await userEvent.click(within(await section()).getByRole('button', { name: 'Exportar…' }))
  await waitFor(() => expect(bridge.savedJsonFiles).toHaveLength(1))
  const [saved] = bridge.savedJsonFiles
  expect(saved.suggestedName).toMatch(/^rinari-memory-\d{4}-\d{2}-\d{2}\.json$/)
  expect(saved.title).toBe('Exportar la memoria de Rinari')
  expect(JSON.parse(saved.contents)).toEqual({ bundle, digest })
  expect(toast.success).toHaveBeenCalledWith(`Memoria exportada a ${saved.suggestedName}.`)
})

it('cancelar el diálogo de guardar no avisa de nada', async () => {
  bridge.nextJsonSave = false
  view()
  await userEvent.click(within(await section()).getByRole('button', { name: 'Exportar…' }))
  await waitFor(() => expect(callsTo('memory_export')).toHaveLength(1))
  expect(toast.success).not.toHaveBeenCalled()
  expect(toast.error).not.toHaveBeenCalled()
})

it('importa tras mostrar el resumen y confirmarlo', async () => {
  bridge.nextJsonFile = file({ bundle, digest })
  view()
  await userEvent.click(within(await section()).getByRole('button', { name: 'Importar…' }))
  const dialog = await screen.findByRole('alertdialog')
  expect(within(dialog).getByText('¿Importar la memoria de rinari-memory-2026-10-09.json?')).toBeTruthy()
  expect(within(dialog).getByText('Recuerdos nuevos: 2')).toBeTruthy()
  expect(within(dialog).getByText('Ya los recuerda: 1')).toBeTruthy()
  expect(within(dialog).getByText('Olvidados antes, no se restauran: 1')).toBeTruthy()
  expect(within(dialog).queryByText(/Descartados/)).toBeNull()
  // Hasta confirmar solo hubo vista previa.
  expect(callsTo('memory_import')).toEqual([{ bundle, digest, dry_run: true }])
  const listsBefore = callsTo('memory_list').length
  await userEvent.click(within(dialog).getByRole('button', { name: 'Importar' }))
  await waitFor(() => expect(callsTo('memory_import')).toEqual([
    { bundle, digest, dry_run: true },
    { bundle, digest, dry_run: false },
  ]))
  expect(toast.success).toHaveBeenCalledWith('Recuerdos importados: 2.')
  await waitFor(() => expect(callsTo('memory_list').length).toBeGreaterThan(listsBefore))
})

it('cancelar la confirmación no importa nada', async () => {
  bridge.nextJsonFile = file({ bundle, digest })
  bridge.mockCommand('memory_import', (args) => summary({ dry_run: Boolean(args.dry_run), sensitive: 1, rejected: 2 }))
  view()
  await userEvent.click(within(await section()).getByRole('button', { name: 'Importar…' }))
  const dialog = await screen.findByRole('alertdialog')
  expect(within(dialog).getByText('Con datos personales sensibles: 1')).toBeTruthy()
  expect(within(dialog).getByText('Descartados por llevar claves o no ser válidos: 2')).toBeTruthy()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(callsTo('memory_import')).toEqual([{ bundle, digest, dry_run: true }])
})

it('sin nada nuevo lo dice sin pedir confirmación', async () => {
  bridge.nextJsonFile = file({ bundle, digest })
  bridge.mockCommand('memory_import', () => summary({ imported: 0, skipped_duplicates: 4, skipped_suppressed: 0 }))
  view()
  await userEvent.click(within(await section()).getByRole('button', { name: 'Importar…' }))
  await waitFor(() => expect(toast.info).toHaveBeenCalled())
  expect(vi.mocked(toast.info).mock.calls[0][0]).toBe('Nada nuevo que importar de rinari-memory-2026-10-09.json.')
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(callsTo('memory_import')).toHaveLength(1)
})

it('rechaza un archivo que no es una exportación sin llamar al Engine', async () => {
  bridge.nextJsonFile = file({ hello: 'world' })
  view()
  await userEvent.click(within(await section()).getByRole('button', { name: 'Importar…' }))
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Este archivo no es una exportación de memoria de Rinari.'))
  expect(callsTo('memory_import')).toEqual([])
})

it('explica un archivo modificado, uno demasiado grande y un turno en curso', async () => {
  bridge.nextJsonFile = file({ bundle, digest })
  bridge.mockCommand('memory_import', () => { throw { code: 'INVALID_PARAMS', message: 'memory bundle digest mismatch; the file was changed' } })
  view()
  const buttons = await section()
  await userEvent.click(within(buttons).getByRole('button', { name: 'Importar…' }))
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('El archivo cambió después de exportarlo o está dañado. No se importó nada.'))

  bridge.nextJsonError = { code: 'FILE_TOO_LARGE', message: 'file is larger than 8388608 bytes' }
  await userEvent.click(within(buttons).getByRole('button', { name: 'Importar…' }))
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('El archivo es demasiado grande para ser una exportación de memoria.'))

  bridge.nextJsonError = null
  bridge.mockCommand('memory_import', (args) => {
    if (args.dry_run) return summary()
    throw { code: 'TURN_RUNNING', message: 'Finish active turns before importing durable memory.' }
  })
  await userEvent.click(within(buttons).getByRole('button', { name: 'Importar…' }))
  await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Importar' }))
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Rinari está trabajando. Inténtalo cuando termine el turno.'))
})

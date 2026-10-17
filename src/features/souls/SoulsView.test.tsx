// @vitest-environment jsdom
// Ajustes → Personalidad (#87): las almas como galería, el panel con su texto
// y sus acciones, duplicar, exportar e importar, y el aviso de alma vacía.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'

const api = vi.hoisted(() => ({
  soulList: vi.fn(),
  soulGet: vi.fn(async (id: string) => ({ soul: { id, name: id === 'mio' ? 'Mio' : 'Rinari', version: '1', source: id === 'mio' ? 'custom' : 'bundled', description: '', identity: '# Rinari\n\nHabla **claro**.' } })),
  soulCreate: vi.fn(async (input: { id: string; name: string; identity: string }) => ({ soul: { ...input, version: '1.0', source: 'custom', description: '' } })),
  soulUpdate: vi.fn(),
  soulActivate: vi.fn(async () => ({})),
  soulRemove: vi.fn(),
  soulExport: vi.fn(async () => ({ path: 'C:/out/rinari-default', files: ['soul.toml', 'identity.md'] })),
  soulImport: vi.fn(async () => ({ soul: { id: 'traida', name: 'Traída', version: '1', source: 'custom', description: '', identity: '' } })),
  soulSettingsGet: vi.fn(async () => ({ settings: { character_intensity: 'balanced', options: [], default: 'balanced' } })),
  soulSettingsSet: vi.fn(),
}))
vi.mock('../../services/engine', () => ({ engineApi: api, commandMessage: String }))
const openFiles = vi.hoisted(() => vi.fn())
vi.mock('../../platform', () => ({ platform: () => ({ dialog: { openFiles } }) }))
vi.mock('../rinari/art', () => ({ art: { face: () => '', chibi: () => '' } }))

import SoulsView, { soulIdFor } from './SoulsView'

afterEach(() => { cleanup(); vi.clearAllMocks() })

const souls = [
  { id: 'rinari-default', name: 'Rinari', version: '3.0', source: 'bundled', description: 'La de serie' },
  { id: 'mio', name: 'Mio', version: '1', source: 'custom', description: '' },
]
const mount = () => render(<I18nProvider lang="es"><SoulsView onChanged={() => {}} /></I18nProvider>)

it('the gallery marks the soul in use, also the built-in one when nothing was picked', async () => {
  api.soulList.mockResolvedValue({ souls, active_id: null, effective_id: 'rinari-default', effective_source: 'default' })
  mount()
  const cards = await screen.findAllByTestId('soul-card')
  expect(cards[0].textContent).toContain('En uso')
  expect(cards[0].textContent).toContain('La de serie')
  expect(cards[1].textContent).not.toContain('En uso')
})

it('with an older Engine without effective_id, the explicit activation is the one in use', async () => {
  api.soulList.mockResolvedValue({ souls, active_id: 'mio' })
  mount()
  const cards = await screen.findAllByTestId('soul-card')
  expect(cards[1].textContent).toContain('En uso')
})

it('opening a soul shows its text as Markdown, uses it, exports it and duplicates it to edit', async () => {
  api.soulList.mockResolvedValue({ souls, active_id: 'mio' })
  openFiles.mockResolvedValue(['C:/out'])
  mount()
  await userEvent.click((await screen.findAllByTestId('soul-card'))[0])
  const panel = await screen.findByTestId('soul-panel')
  expect(within(panel).getByTestId('soul-panel-text').querySelector('strong')?.textContent).toBe('claro')
  // Built in: no edit nor delete.
  expect(within(panel).queryByRole('button', { name: /Editar/ })).toBeNull()
  await userEvent.click(within(panel).getByRole('button', { name: /Exportar/ }))
  await waitFor(() => expect(api.soulExport).toHaveBeenCalledWith('rinari-default', 'C:/out'))
  await userEvent.click(within(panel).getByRole('button', { name: /Duplicar para editar/ }))
  const form = await screen.findByTestId('soul-form')
  expect((within(form).getByLabelText('Nombre') as HTMLInputElement).value).toBe('Rinari (copia)')
  await userEvent.click(within(form).getByTestId('soul-save'))
  await waitFor(() => expect(api.soulCreate).toHaveBeenCalledWith(expect.objectContaining({ id: 'rinari-copia', name: 'Rinari (copia)', identity: '# Rinari\n\nHabla **claro**.' })))
})

it('a new soul without text warns that only the level will speak, and can preview its Markdown', async () => {
  api.soulList.mockResolvedValue({ souls, active_id: null })
  mount()
  await userEvent.click(await screen.findByRole('button', { name: 'Crear Soul' }))
  const form = await screen.findByTestId('soul-form')
  expect(within(form).getByTestId('soul-empty-warning').textContent).toContain('solo el nivel de personalidad')
  await userEvent.type(within(form).getByLabelText('Identidad (texto del prompt)'), '**hola**')
  expect(within(form).queryByTestId('soul-empty-warning')).toBeNull()
  await userEvent.click(within(form).getByRole('tab', { name: 'Vista previa' }))
  expect(within(form).getByTestId('soul-form-preview').querySelector('strong')?.textContent).toBe('hola')
})

it('importing takes the picked files and opens the new soul', async () => {
  api.soulList.mockResolvedValue({ souls, active_id: null })
  openFiles.mockResolvedValue(['C:/in/traida/soul.toml', 'C:/in/traida/identity.md'])
  mount()
  await userEvent.click(await screen.findByTestId('soul-import'))
  await waitFor(() => expect(api.soulImport).toHaveBeenCalledWith(['C:/in/traida/soul.toml', 'C:/in/traida/identity.md']))
  expect((await screen.findByTestId('soul-panel')).textContent).toContain('Traída')
})

it('an id comes from the name, free among the souls', () => {
  expect(soulIdFor('Rinari (copia)', new Set(['rinari-copia']))).toBe('rinari-copia-2')
  expect(soulIdFor('Ñandú Seria', new Set())).toBe('nandu-seria')
  expect(soulIdFor('💜', new Set())).toBe('alma')
})

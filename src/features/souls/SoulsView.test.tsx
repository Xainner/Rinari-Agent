// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { engineApi } from '../../services/engine'
import SoulsView from './SoulsView'

vi.mock('../../services/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/engine')>()
  return { ...actual, engineApi: { ...actual.engineApi, soulList: vi.fn() } }
})

afterEach(() => { cleanup(); vi.clearAllMocks() })

const souls = [
  { id: 'rinari-default', name: 'Rinari', version: '3.0', source: 'bundled', description: '' },
  { id: 'mio', name: 'Mio', version: '1', source: 'custom', description: '' },
]

it('marca como activo el Soul de serie cuando nada se activó a mano', async () => {
  // Un home nuevo: sin activación explícita, pero Rinari ya habla con el de serie.
  vi.mocked(engineApi.soulList).mockResolvedValue({
    souls, active_id: null, effective_id: 'rinari-default', effective_source: 'default',
  } as never)
  render(<I18nProvider lang="es"><SoulsView onChanged={() => {}} /></I18nProvider>)
  expect(await screen.findByText('Rinari · activa')).toBeTruthy()
  // Sólo el otro se puede activar.
  expect(screen.getAllByRole('button', { name: 'Activar' })).toHaveLength(1)
})

it('con un Engine anterior sin effective_id usa la activación explícita', async () => {
  vi.mocked(engineApi.soulList).mockResolvedValue({ souls, active_id: 'mio' } as never)
  render(<I18nProvider lang="es"><SoulsView onChanged={() => {}} /></I18nProvider>)
  expect(await screen.findByText('Mio · activa')).toBeTruthy()
})

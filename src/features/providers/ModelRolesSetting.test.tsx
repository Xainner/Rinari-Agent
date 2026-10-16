// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { engineApi } from '../../services/engine'
import ModelRolesSetting from './ModelRolesSetting'

vi.mock('../engine/EngineContext', () => ({
  useOptionalEngineData: () => ({ models: [{ id: 'mdl_cheap', alias: 'cheap', provider: 'opencode-go' }, { id: 'mdl_big', alias: 'big', provider: 'openai' }] }),
}))

afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('sets the fallback and auxiliary models, and compaction only with an auxiliary (#80)', async () => {
  vi.spyOn(engineApi, 'modelRoles').mockResolvedValue({ roles: { fallback: null, auxiliary: null, auxiliary_compaction: false } })
  const set = vi.spyOn(engineApi, 'setModelRoles').mockResolvedValue({ roles: { fallback: null, auxiliary: 'mdl_cheap', auxiliary_compaction: false } })
  render(<I18nProvider lang="es"><ModelRolesSetting /></I18nProvider>)
  const compaction = await screen.findByRole('checkbox', { name: /compactar/ })
  expect((compaction as HTMLInputElement).disabled).toBe(true)
  await userEvent.selectOptions(screen.getByLabelText('Modelo auxiliar'), 'mdl_cheap')
  expect(set).toHaveBeenCalledWith({ auxiliary: 'mdl_cheap' })
  await waitFor(() => expect((screen.getByRole('checkbox', { name: /compactar/ }) as HTMLInputElement).disabled).toBe(false))
})

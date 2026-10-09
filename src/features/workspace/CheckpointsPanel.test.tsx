// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { installMockPlatform } from '../../test/mockPlatform'
import { I18nProvider } from '../../i18n'
import CheckpointsPanel from './CheckpointsPanel'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
const { invoke } = installMockPlatform()
const error = { code: 'INVALID_USAGE', message: 'Checkpoints require a Git repository: C:/chats/test' }
beforeEach(() => { invoke.mockReset(); vi.mocked(toast.error).mockClear() })
afterEach(cleanup)

it('reports a load error once under StrictMode, with retry and no misleading empty state', async () => {
  invoke.mockRejectedValue(error)
  render(<StrictMode><I18nProvider lang="es"><CheckpointsPanel path="C:/chats/test" /></I18nProvider></StrictMode>)
  expect((await screen.findByRole('alert')).textContent).toContain(error.message)
  expect(screen.getAllByRole('alert')).toHaveLength(1)
  expect(toast.error).not.toHaveBeenCalled()
  expect(screen.queryByText('Sin checkpoints.')).toBeNull()
  invoke.mockResolvedValue({ checkpoints: [{ id: 'checkpoint-1', label: 'Estado inicial' }] })
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByRole('button', { name: 'Estado inicial' })).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
})

it('ignores a stale load failure after changing the workspace', async () => {
  let reject!: (reason: unknown) => void
  invoke.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail }))
    .mockResolvedValue({ checkpoints: [] })
  const view = render(<I18nProvider lang="es"><CheckpointsPanel path="C:/old" /></I18nProvider>)
  view.rerender(<I18nProvider lang="es"><CheckpointsPanel path="C:/new" /></I18nProvider>)
  expect(await screen.findByText('Sin checkpoints.')).toBeTruthy()
  await act(async () => reject(error))
  expect(screen.queryByRole('alert')).toBeNull()
  expect(toast.error).not.toHaveBeenCalled()
})

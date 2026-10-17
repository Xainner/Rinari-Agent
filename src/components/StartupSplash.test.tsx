// @vitest-environment jsdom
// La pantalla de arranque (#70): «Copiar detalles» dice que copió, y pasados
// 10 s avisa de que el primer arranque puede tardar más.
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'

vi.mock('../lib/clipboard', () => ({ copyText: vi.fn(async () => true) }))
vi.mock('../hooks/useWindowBounds', () => ({ useWindowBounds: () => undefined }))
vi.mock('../features/rinari/art', () => ({ art: { sky: () => '', chibi: () => '' } }))

import StartupSplash from './StartupSplash'

afterEach(() => { cleanup(); vi.useRealTimers() })

it('«Copiar detalles» turns into «Copiado» for a moment', async () => {
  vi.useFakeTimers()
  render(<I18nProvider lang="es"><StartupSplash failed detail="handshake" state="failed" onRetry={() => {}} /></I18nProvider>)
  await act(async () => { screen.getByRole('button', { name: /Copiar detalles/ }).click() })
  expect(screen.getByRole('button', { name: /Copiado/ })).toBeTruthy()
  await act(async () => { vi.advanceTimersByTime(1600) })
  expect(screen.getByRole('button', { name: /Copiar detalles/ })).toBeTruthy()
})

it('after 10 s the start says the first one can take longer', async () => {
  vi.useFakeTimers()
  render(<I18nProvider lang="es"><StartupSplash failed={false} state="handshaking" onRetry={() => {}} /></I18nProvider>)
  expect(screen.queryByText(/puede tardar más/)).toBeNull()
  await act(async () => { vi.advanceTimersByTime(10_100) })
  expect(screen.getByText(/puede tardar más/)).toBeTruthy()
})

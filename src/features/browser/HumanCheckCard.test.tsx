// @vitest-environment jsdom
// #45: la página pide una verificación humana; la tarjeta ofrece hacerlo tú, sin resolverlo.
import { installMockPlatform } from '../../test/mockPlatform'
installMockPlatform()
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { platform } from '../../platform'
import { engineApi } from '../../services/engine'
import type { ToolTimelineItem } from '../activity/types'
import { HumanCheckCard, humanCheckOf } from './HumanCheckCard'
import { applyExternalBrowserEvent, useExternalBrowserStore } from './externalBrowserStore'

afterEach(() => { cleanup(); vi.restoreAllMocks(); useExternalBrowserStore.setState({ bySession: {} }) })

const check = { check: 'turnstile', url: 'https://login.example/es/log-in' }
const ui = () => render(<I18nProvider lang="es"><HumanCheckCard sessionId="ses_1" check={check} /></I18nProvider>)

it('reads HUMAN_CHECK from the browser tool result, and nothing else', () => {
  const item = (data: unknown) => ({ type: 'tool', presentation: { kind: 'tool', data } }) as unknown as ToolTimelineItem
  expect(humanCheckOf(item({ browser_error: 'HUMAN_CHECK', check: 'turnstile', url: check.url }))).toEqual(check)
  expect(humanCheckOf(item({ browser_error: 'BROWSER_INTERVENED' }))).toBeNull()
  expect(humanCheckOf(item(undefined))).toBeNull()
})

it('says what happened and opens the page in the owner browser', async () => {
  const openUrl = vi.spyOn(platform().opener, 'openUrl').mockResolvedValue(undefined)
  ui()
  expect(document.body.textContent).toContain('Este sitio verifica que seas una persona')
  expect(document.body.textContent).toContain(check.url)
  fireEvent.click(screen.getByTestId('human-check-open-mine'))
  await waitFor(() => expect(openUrl).toHaveBeenCalledWith(check.url))
})

it('moves the session to Chrome/Edge with Rinari and follows the engine', async () => {
  const open = vi.spyOn(engineApi, 'browserExternalOpen').mockResolvedValue({ session_id: 'ses_1', state: 'opening' })
  ui()
  fireEvent.click(screen.getByTestId('human-check-open-chrome'))
  await waitFor(() => expect(open).toHaveBeenCalledWith('ses_1', check.url))
  expect(screen.getByTestId('human-check-open-chrome').textContent).toContain('Abriendo')
  act(() => applyExternalBrowserEvent({ session_id: 'ses_1', state: 'open', url: check.url }))
  expect(screen.getByTestId('human-check-open-chrome').textContent).toContain('Abierto en Chrome/Edge')
  expect((screen.getByTestId('human-check-open-chrome') as HTMLButtonElement).disabled).toBe(true)
})

it('a failed launch lets the owner try again', async () => {
  vi.spyOn(engineApi, 'browserExternalOpen').mockResolvedValue({ session_id: 'ses_1', state: 'opening' })
  ui()
  fireEvent.click(screen.getByTestId('human-check-open-chrome'))
  act(() => applyExternalBrowserEvent({ session_id: 'ses_1', state: 'failed', error: { code: 'BROWSER_DEPENDENCY', message: 'no Chrome' } }))
  await waitFor(() => expect((screen.getByTestId('human-check-open-chrome') as HTMLButtonElement).disabled).toBe(false))
})

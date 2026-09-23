// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createTestBridge } from '../../platform/testBridge'
import { setPlatformForTests } from '../../platform'
import { I18nProvider } from '../../i18n'
import ProviderAuthPanel from './ProviderAuthPanel'

let restore: (() => void) | undefined
afterEach(() => { cleanup(); restore?.(); vi.useRealTimers() })
const disconnected = { provider_id: 'account', operation_id: null, status: 'disconnected', authorization_url: null, user_code: null, expires_at: null, detail: '' }

it('opens login outside the renderer, polls and refreshes the catalog on connection', async () => {
  vi.useFakeTimers()
  const bridge = createTestBridge()
  restore = setPlatformForTests(bridge)
  let gets = 0
  bridge.mockCommand('provider_auth_get', () => (++gets === 1 ? disconnected : { ...disconnected, status: 'connected', operation_id: 'op' }))
  bridge.mockCommand('provider_auth_start', () => ({ ...disconnected, status: 'waiting', operation_id: 'op', authorization_url: 'https://auth.openai.com/oauth/authorize?state=synthetic' }))
  const changed = vi.fn()
  render(<I18nProvider lang="en"><ProviderAuthPanel providerAlias="account" onConnected={changed} /></I18nProvider>)
  await act(async () => { await Promise.resolve() })
  await act(async () => { fireEvent.click(screen.getByText('Connect account')) })
  expect(bridge.openedUrls).toEqual(['https://auth.openai.com/oauth/authorize?state=synthetic'])
  await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
  expect(changed).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('status').textContent).toBe('Account connected')
})

it('cancels a pending device operation and removes its public code', async () => {
  const bridge = createTestBridge()
  restore = setPlatformForTests(bridge)
  bridge.mockCommand('provider_auth_get', () => disconnected)
  bridge.mockCommand('provider_auth_start', () => ({ ...disconnected, status: 'waiting', operation_id: 'op', user_code: 'PUBLIC-CODE' }))
  bridge.mockCommand('provider_auth_cancel', () => ({ ...disconnected, status: 'cancelled' }))
  render(<I18nProvider lang="en"><ProviderAuthPanel providerAlias="account" onConnected={() => {}} /></I18nProvider>)
  await screen.findByText('Disconnected')
  fireEvent.click(screen.getByText('Use device code'))
  await screen.findByText('PUBLIC-CODE')
  fireEvent.click(screen.getByText('Cancel'))
  await screen.findByText('Authorization cancelled')
  expect(screen.queryByText('PUBLIC-CODE')).toBeNull()
})

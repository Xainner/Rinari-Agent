// @vitest-environment jsdom
// Una actualización disponible también queda en la campana (Sistema): una
// fila por versión, sin reactivarse por consultar otra vez, y retirada cuando
// deja de estar vigente.
import { installMockPlatform } from '../../test/mockPlatform'
const { bridge } = installMockPlatform()
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { UpdateState } from '../../platform'
import { resetNotificationCenterForTests, selectUnreadCount, useNotificationCenter } from '../../stores/notificationCenter'
import UpdateNotifier, { UPDATE_ANNOUNCED_KEY, UPDATE_CHECK_INTERVAL_MS, compareVersions, reconcileUpdate } from './UpdateNotifier'

const state = (phase: UpdateState['phase'], available: string | null, current = '0.2.4'): UpdateState => ({
  phase, current_version: current, available_version: available, progress: null, message: null, unsigned: true,
})
const rows = () => useNotificationCenter.getState().items.filter((item) => item.id.startsWith('update:'))

beforeEach(() => {
  resetNotificationCenterForTests()
  window.localStorage.removeItem(UPDATE_ANNOUNCED_KEY)
})
afterEach(() => { cleanup(); vi.useRealTimers() })

it('compares versions numerically', () => {
  expect(compareVersions('0.2.10', '0.2.9')).toBeGreaterThan(0)
  expect(compareVersions('v0.3.0', '0.3.0')).toBe(0)
})

it('one row per version, announced once per phase, never by re-checking', () => {
  reconcileUpdate(state('available', '0.2.5'), 'checking', 'es')
  expect(rows().map((r) => [r.id, r.title, r.target])).toEqual([['update:0.2.5', 'Nueva versión disponible: 0.2.5', { kind: 'update' }]])
  expect(selectUnreadCount(useNotificationCenter.getState())).toBe(1)
  useNotificationCenter.getState().markRead('system')
  // The same version again, progress, a language change: read stays read.
  reconcileUpdate(state('available', '0.2.5'), 'checking', 'es')
  reconcileUpdate({ ...state('downloading', '0.2.5'), progress: { percent: 40 } as UpdateState['progress'] }, 'available', 'en')
  expect(selectUnreadCount(useNotificationCenter.getState())).toBe(0)
  // Downloaded is a new, actionable phase: one notice.
  reconcileUpdate(state('downloaded', '0.2.5'), 'downloading', 'es')
  expect(rows()).toHaveLength(1)
  expect(rows()[0].title).toBe('La versión 0.2.5 está lista para aplicar.')
  expect(selectUnreadCount(useNotificationCenter.getState())).toBe(1)
  // Dismissed with ×: a later check of the same phase does not bring it back.
  useNotificationCenter.getState().dismiss('update:0.2.5')
  reconcileUpdate(state('downloaded', '0.2.5'), 'checking', 'es')
  expect(rows()).toHaveLength(0)
})

it('retires the row when installed, superseded or no longer offered, but not on a network error', () => {
  reconcileUpdate(state('available', '0.2.5'), 'checking', 'es')
  reconcileUpdate(state('error', '0.2.5'), 'checking', 'es')
  expect(rows()).toHaveLength(1)
  // Initial idle (not checked yet) keeps it.
  reconcileUpdate(state('idle', null), null, 'es')
  expect(rows()).toHaveLength(1)
  reconcileUpdate(state('available', '0.2.6'), 'checking', 'es')
  expect(rows().map((r) => r.id)).toEqual(['update:0.2.6'])
  reconcileUpdate(state('idle', null), 'checking', 'es')
  expect(rows()).toHaveLength(0)
  reconcileUpdate(state('available', '0.2.7'), 'checking', 'es')
  reconcileUpdate(state('idle', null, '0.2.7'), null, 'es')
  expect(rows()).toHaveLength(0)
})

it('recovers what the host already knew and checks again every 6 hours', async () => {
  vi.useFakeTimers()
  bridge.updateState = state('downloaded', '0.2.5')
  const check = vi.spyOn(bridge.updates, 'check')
  render(<UpdateNotifier lang="es" />)
  await act(async () => { await Promise.resolve() })
  expect(rows()[0]?.title).toBe('La versión 0.2.5 está lista para aplicar.')
  expect(check).not.toHaveBeenCalled()
  await act(async () => { await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS) })
  expect(check).toHaveBeenCalledTimes(1)
  // Live state from the host reaches the bell too.
  act(() => bridge.emitUpdateState(state('available', '0.2.8')))
  expect(rows().map((r) => r.id)).toEqual(['update:0.2.8'])
})

// @vitest-environment jsdom
// Un solo reproductor de tonos: preferencias, ráfagas con prioridad y solo
// sucesos vividos donde no estás mirando.
import { installMockPlatform } from '../../test/mockPlatform'
installMockPlatform()
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { requestSound, previewSound, setSoundPlayerForTests, SOUND_BURST_MS } from '../../services/notificationSounds'
import { DEFAULT_SOUND_PREFS, normalizeSoundPrefs, useSoundPrefs } from '../../stores/soundPrefs'
import { engineEventAction } from '../activity/turnTimelineReducer'
import { BoardHarness, engineFixture, sessionFixture } from '../board/testUtils'
import { useUIStore } from '../../stores/ui'
import SoundCoordinator from './SoundCoordinator'
import { refreshWindowAttentionForTests } from '../../hooks/useWindowAttention'

const played: string[] = []
const NOW = 1_700_000_000_000
const event = (name: string, payload: Record<string, unknown>) => engineEventAction({ type: 'event', event: name, payload }, NOW)!

beforeEach(() => {
  vi.useFakeTimers()
  played.length = 0
  setSoundPlayerForTests((url) => played.push(url.replace(/^.*sounds\//, '')))
  useSoundPrefs.setState({ ...normalizeSoundPrefs(null) })
  // Ventana sin atender: el usuario está en otra app.
  vi.spyOn(document, 'hasFocus').mockReturnValue(false)
  refreshWindowAttentionForTests()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  setSoundPlayerForTests(null)
})

const settle = () => act(() => { vi.advanceTimersByTime(SOUND_BURST_MS + 10) })

it('a burst sounds once, with its most important category', () => {
  requestSound('success')
  requestSound('error')
  requestSound('success')
  vi.advanceTimersByTime(SOUND_BURST_MS + 10)
  expect(played).toEqual(['soft/error.mp3'])
  requestSound('success')
  requestSound('attention')
  vi.advanceTimersByTime(SOUND_BURST_MS + 10)
  expect(played).toEqual(['soft/error.mp3', 'soft/attention.mp3'])
})

it('respects the switch, the categories and the chosen pack; preview always plays', () => {
  useSoundPrefs.getState().update({ categories: { success: false }, pack: 'rinari' })
  requestSound('success')
  vi.advanceTimersByTime(SOUND_BURST_MS + 10)
  expect(played).toEqual([])
  requestSound('reminder')
  vi.advanceTimersByTime(SOUND_BURST_MS + 10)
  expect(played).toEqual(['rinari/reminder.mp3'])
  useSoundPrefs.getState().update({ enabled: false })
  requestSound('attention')
  vi.advanceTimersByTime(SOUND_BURST_MS + 10)
  previewSound('success', 'soft')
  expect(played).toEqual(['rinari/reminder.mp3', 'soft/success.mp3'])
})

it('stored preferences are sanitized', () => {
  expect(normalizeSoundPrefs({ pack: 'loud', volume: 7, categories: { error: false, bogus: true } })).toEqual({
    ...DEFAULT_SOUND_PREFS,
    volume: 1,
    categories: { ...DEFAULT_SOUND_PREFS.categories, error: false },
  })
})

function mountCoordinator(active = 'ses_other') {
  const engine = engineFixture({ sessions: [sessionFixture('ses_a', 'A'), sessionFixture('ses_other', 'Otra')], activeSession: active })
  const { dispatch } = engine.runtime.getState()
  render(<BoardHarness engine={engine}><SoundCoordinator activeSession={active} /></BoardHarness>)
  return { dispatch: (name: string, payload: Record<string, unknown>) => act(() => dispatch(event(name, payload))) }
}

it('a turn that finishes while you are elsewhere sounds; one loaded from history does not', () => {
  const { dispatch } = mountCoordinator()
  dispatch('turn.started', { turn_id: 't1', session_id: 'ses_a' })
  dispatch('turn.completed', { turn_id: 't1', session_id: 'ses_a' })
  settle()
  expect(played).toEqual(['soft/success.mp3'])
  dispatch('turn.failed', { turn_id: 't-old', session_id: 'ses_a', error: 'x' })
  settle()
  expect(played).toEqual(['soft/success.mp3'])
  dispatch('turn.started', { turn_id: 't2', session_id: 'ses_a' })
  dispatch('turn.cancelled', { turn_id: 't2', session_id: 'ses_a' })
  dispatch('turn.started', { turn_id: 't3', session_id: 'ses_a' })
  dispatch('turn.failed', { turn_id: 't3', session_id: 'ses_a', error: 'boom' })
  settle()
  expect(played).toEqual(['soft/success.mp3', 'soft/error.mp3'])
})

it('the conversation you are looking at stays quiet unless you ask for it', () => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  refreshWindowAttentionForTests()
  useUIStore.setState({ view: 'chat' })
  const { dispatch } = mountCoordinator('ses_a')
  dispatch('turn.started', { turn_id: 't1', session_id: 'ses_a' })
  dispatch('turn.completed', { turn_id: 't1', session_id: 'ses_a' })
  settle()
  expect(played).toEqual([])
  useSoundPrefs.getState().update({ whileAttended: true })
  dispatch('turn.started', { turn_id: 't2', session_id: 'ses_a' })
  dispatch('turn.completed', { turn_id: 't2', session_id: 'ses_a' })
  settle()
  expect(played).toEqual(['soft/success.mp3'])
})

it('a new approval during a live turn asks for attention once', () => {
  const { dispatch } = mountCoordinator()
  dispatch('turn.started', { turn_id: 't1', session_id: 'ses_a' })
  const approval = { turn_id: 't1', session_id: 'ses_a', approval_id: 'ap1', capability: 'shell.exec', risk: 'high', description: 'npm install' }
  dispatch('approval.requested', approval)
  dispatch('approval.requested', approval)
  settle()
  expect(played).toEqual(['soft/attention.mp3'])
})

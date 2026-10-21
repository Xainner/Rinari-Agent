// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  agencyAgents: vi.fn(),
  agencyStatus: vi.fn(async () => null),
}))
vi.mock('../../services/engine', () => ({
  engineApi: api,
  onEngineEvent: vi.fn(async () => () => {}),
}))

import { useAgency } from './useAgency'
import { useProfileStore } from '../profiles/profileStore'

const writer = { id: 'w', name: 'Writer', session_id: 'ses_w' }

it('keeps the last good answer when a newer reload fails', async () => {
  let answer: (value: unknown) => void = () => {}
  api.agencyAgents
    .mockImplementationOnce(() => new Promise((resolve) => { answer = resolve }))
    .mockImplementationOnce(async () => { throw new Error('reiniciando') })
  const { result } = renderHook(() => useAgency(true))
  await waitFor(() => expect(api.agencyAgents).toHaveBeenCalledTimes(1))
  await act(async () => { await result.current.reload() })
  await act(async () => { answer({ agents: [writer] }) })
  await waitFor(() => expect(result.current.agents).toEqual([writer]))
  expect(result.current.loaded).toBe(true)
})

it('keeps the answer that arrives once the active profile becomes known, and reloads on a switch', async () => {
  // Startup: the app does not know its profile yet when it asks.
  useProfileStore.setState({ activeId: null })
  let answer: (value: unknown) => void = () => {}
  api.agencyAgents.mockReset()
  api.agencyAgents
    .mockImplementationOnce(() => new Promise((resolve) => { answer = resolve }))
    .mockImplementation(() => new Promise(() => {}))
  const { result } = renderHook(() => useAgency(true))
  await waitFor(() => expect(api.agencyAgents).toHaveBeenCalledTimes(1))
  // The profiles load (the owner's is «test»), then the Engine answers.
  act(() => { useProfileStore.setState({ activeId: 'test' }) })
  await act(async () => { answer({ agents: [writer] }) })
  await waitFor(() => expect(api.agencyAgents.mock.calls.length).toBeGreaterThanOrEqual(2))
  // The first answer is kept (it was for the Engine's active profile, «test»).
  await waitFor(() => expect(result.current.agents).toEqual([writer]))
})

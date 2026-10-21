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

// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { engineApi } from '../../services/engine'
import { useProjectExpansionStore } from '../../stores/projectExpansion'
import { projectFixture, sessionFixture } from '../board/testUtils'
import { useProjects } from './useProjects'
import { useProjectPromotionReveal } from './useProjectPromotionReveal'

const project = projectFixture('p', 'New project')
beforeEach(() => {
  useProjectExpansionStore.setState({ choices: { p: false, other: false }, query: 'hidden' })
  vi.spyOn(engineApi, 'projectRecents').mockResolvedValue({ projects: [project] })
  vi.spyOn(engineApi, 'projectList').mockResolvedValue({ projects: [project] })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear() })

it.each([
  [true, false, true],
  [false, true, true],
  [false, false, false],
])('registration=%s / session creation=%s reveals=%s', async (registered, created, revealed) => {
  vi.spyOn(engineApi, 'projectAdd').mockResolvedValue({ project, created: registered })
  vi.spyOn(engineApi, 'projectOpen').mockResolvedValue({ project, session: sessionFixture('s', 'Session', 'p'), created })
  const { result } = renderHook(() => useProjects({ engineReady: false }))
  await act(async () => { expect(await result.current.openProject('/repo/p')).not.toBeNull() })
  expect(useProjectExpansionStore.getState().choices).toEqual({ p: revealed, other: false })
  expect(useProjectExpansionStore.getState().query).toBe(revealed ? '' : 'hidden')
})

it('keeps a confirmed empty registration visible even if subsequent session creation fails', async () => {
  vi.spyOn(engineApi, 'projectAdd').mockResolvedValue({ project, created: true })
  vi.spyOn(engineApi, 'projectOpen').mockRejectedValue(new Error('no model'))
  const { result } = renderHook(() => useProjects({ engineReady: false }))
  await act(async () => { expect(await result.current.openProject('/repo/p')).toBeNull() })
  expect(result.current.projects).toEqual([project])
  expect(useProjectExpansionStore.getState().choices.p).toBe(true)
})

it('does not reveal after a failed registration; refresh and rename respect manual collapse', async () => {
  vi.spyOn(engineApi, 'projectAdd').mockRejectedValue(new Error('missing folder'))
  vi.spyOn(engineApi, 'projectUpdate').mockResolvedValue({ project: { ...project, name: 'Renamed' } })
  const { result } = renderHook(() => useProjects({ engineReady: false }))
  await act(async () => { await result.current.openProject('/missing'); await result.current.updateProject('p', { name: 'Renamed' }); await result.current.refreshProjects() })
  expect(useProjectExpansionStore.getState().choices.p).toBe(false)
  expect(useProjectExpansionStore.getState().query).toBe('hidden')
})

it('reveals a confirmed promotion once, skipping hydration, duplicate refresh and engine restart', async () => {
  const chat = sessionFixture('s', 'Chat')
  const promoted = sessionFixture('s', 'Project session', 'p')
  const refresh = vi.fn(async () => {})
  const hook = renderHook(({ sessions, generation }) => useProjectPromotionReveal(sessions, generation, refresh), {
    initialProps: { sessions: { s: chat }, generation: 1 },
  })
  hook.rerender({ sessions: { s: promoted }, generation: 1 })
  await waitFor(() => expect(useProjectExpansionStore.getState().choices.p).toBe(true))
  expect(refresh).toHaveBeenCalledOnce()
  act(() => useProjectExpansionStore.getState().toggle('p', 'p'))
  hook.rerender({ sessions: { s: { ...promoted, title: 'Renamed' } }, generation: 1 })
  hook.rerender({ sessions: { s: chat }, generation: 2 })
  hook.rerender({ sessions: { s: promoted }, generation: 3 })
  expect(useProjectExpansionStore.getState().choices.p).toBe(false)
  expect(refresh).toHaveBeenCalledOnce()
  hook.unmount()
  renderHook(() => useProjectPromotionReveal({ s: promoted }, 1, refresh))
  expect(useProjectExpansionStore.getState().choices.p).toBe(false)
})

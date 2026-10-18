// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { SessionSummary } from '../../services/engine'
import { useUnknownProjectRefresh } from './useUnknownProjectRefresh'

const session = (id: string, project_id: string | null) => ({ id, project_id, kind: project_id ? 'PROJECT' : 'CHAT' }) as unknown as SessionSummary

it('asks for the projects again when a conversation names one the app does not know, once (F5, plan 0.4.0 v2)', () => {
  const refresh = vi.fn(async () => {})
  const known = ['prj_a']
  const { rerender } = renderHook(({ sessions, enabled }) => useUnknownProjectRefresh(sessions, known, refresh, enabled), {
    initialProps: { sessions: { s1: session('s1', 'prj_a'), s2: session('s2', 'prj_new') }, enabled: false },
  })
  expect(refresh).not.toHaveBeenCalled()
  rerender({ sessions: { s1: session('s1', 'prj_a'), s2: session('s2', 'prj_new') }, enabled: true })
  expect(refresh).toHaveBeenCalledTimes(1)
  rerender({ sessions: { s1: session('s1', 'prj_a'), s2: session('s2', 'prj_new'), s3: session('s3', null) }, enabled: true })
  expect(refresh).toHaveBeenCalledTimes(1)
})

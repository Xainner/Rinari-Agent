// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

type Listener = (event: { type: string; event: string; payload: Record<string, unknown> }) => void
const listeners: Listener[] = []
vi.mock('../../services/engine', () => ({
  commandMessage: (error: unknown) => String(error),
  onEngineEvent: vi.fn(async (callback: Listener) => {
    listeners.push(callback)
    return () => {
      const index = listeners.indexOf(callback)
      if (index >= 0) listeners.splice(index, 1)
    }
  }),
}))
vi.mock('../../services/desktop', () => ({
  desktopApi: { questions: vi.fn() },
}))

import { desktopApi, type QuestionRequest } from '../../services/desktop'
import { resetPendingQuestionsForTests, usePendingQuestions } from './usePendingQuestions'

const pending = (id: string, sessionId: string): QuestionRequest => ({ request_id: id, session_id: sessionId, turn_id: 't', status: 'pending', questions: [] })

function Badge({ sessionId }: { sessionId: string }) {
  const requests = usePendingQuestions(sessionId)
  return <span data-testid={`badge-${sessionId}`}>{requests.length}</span>
}

beforeEach(() => {
  listeners.length = 0
  resetPendingQuestionsForTests()
  vi.mocked(desktopApi.questions).mockImplementation(async (sessionId: string) => ({
    questions: sessionId === 'A' ? [pending('q1', 'A'), { ...pending('q2', 'A'), status: 'answered' as const }] : [],
  }))
})
afterEach(cleanup)

it('shares one load per session between consumers and filters pending requests', async () => {
  render(
    <>
      <Badge sessionId="A" />
      <Badge sessionId="A" />
      <Badge sessionId="B" />
    </>,
  )
  await waitFor(() => expect(screen.getAllByTestId('badge-A')[0].textContent).toBe('1'))
  expect(screen.getAllByTestId('badge-A')[1].textContent).toBe('1')
  expect(screen.getByTestId('badge-B').textContent).toBe('0')
  expect(desktopApi.questions).toHaveBeenCalledTimes(2)
  expect(listeners).toHaveLength(2)
})

it('refreshes only the session named by an engine event and releases on unmount', async () => {
  const view = render(<Badge sessionId="A" />)
  await waitFor(() => expect(screen.getByTestId('badge-A').textContent).toBe('1'))
  vi.mocked(desktopApi.questions).mockResolvedValue({ questions: [] })
  await act(async () => {
    for (const listener of listeners) listener({ type: 'event', event: 'question.resolved', payload: { session_id: 'B' } })
  })
  expect(screen.getByTestId('badge-A').textContent).toBe('1')
  await act(async () => {
    for (const listener of listeners) listener({ type: 'event', event: 'question.resolved', payload: { session_id: 'A' } })
  })
  await waitFor(() => expect(screen.getByTestId('badge-A').textContent).toBe('0'))
  view.unmount()
  // La liberación es diferida un microtask para sobrevivir a remounts inmediatos.
  await act(async () => {
    await Promise.resolve()
  })
  expect(listeners).toHaveLength(0)
})

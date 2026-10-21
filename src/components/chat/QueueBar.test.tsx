// @vitest-environment jsdom
// La cola de la conversación dice de quién es cada mensaje: tuyo, o de una
// tarea que corre aquí («Repetir aquí»).
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('../../services/engine', () => ({
  engineApi: {
    queueList: vi.fn(async () => ({
      queue: ['hola', 'Revisa el precio'],
      entries: [
        { message_id: null, message: 'hola', state: 'queued', origin: { kind: 'user' } },
        { message_id: null, message: 'Revisa el precio', state: 'queued', origin: { kind: 'schedule', task_id: 'sch_1', run_id: 'run_1', task_name: 'Revisar el precio', target: 'this_conversation' } },
      ],
    })),
    queueAdd: vi.fn(),
    queueClear: vi.fn(),
  },
  onEngineEvent: vi.fn(async () => () => {}),
  commandMessage: String,
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { I18nProvider } from '../../i18n'
import QueueBar from './QueueBar'

afterEach(cleanup)

it('a queued run of a task is shown as the task, not as yours', async () => {
  render(<I18nProvider lang="es"><QueueBar sessionId="ses_1" refreshKey showInput={false} /></I18nProvider>)
  const task = await screen.findByTestId('queue-entry-schedule')
  expect(task.textContent).toBe('Revisar el precio')
  expect(screen.getAllByText('Tuyo')).toHaveLength(1)
})

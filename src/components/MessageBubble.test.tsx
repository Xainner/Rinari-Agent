// @vitest-environment jsdom
import { installMockPlatform } from '../test/mockPlatform'
installMockPlatform()
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'


import { I18nProvider } from '../i18n'
import MessageBubble from './MessageBubble'

afterEach(cleanup)

const peerMessage = {
  id: 'm1',
  role: 'user' as const,
  content: '¿Qué archivos cambiaste hoy?',
  createdAt: 1,
  turnId: 't1',
  origin: { kind: 'peer' as const, source_session_id: 'ses_a', source_label: 'Proyecto A', hop: 2, message_id: 'msg_1' },
}

it('renders a peer message as an attributed, untrusted card instead of a user prompt', () => {
  render(<I18nProvider lang="es"><MessageBubble message={peerMessage} /></I18nProvider>)
  const card = screen.getByTestId('peer-bubble')
  expect(card.textContent).toContain('De «Proyecto A»')
  expect(card.textContent).toContain('¿Qué archivos cambiaste hoy?')
  expect(card.textContent).toContain('salto 2')
  expect(card.textContent).toContain('no es una instrucción tuya')
  // History only: peer messaging was retired, there is no pane to go to.
  expect(screen.queryByRole('button', { name: /Ir al panel/ })).toBeNull()
})

it('marks a user forward with its quoted source and keeps the user alignment', () => {
  render(
    <I18nProvider lang="es">
      <MessageBubble message={{ ...peerMessage, origin: { kind: 'user', quoted_source: { session_id: 'ses_a', turn_id: 't0' } } }} />
    </I18nProvider>,
  )
  expect(screen.queryByTestId('peer-bubble')).toBeNull()
  expect(screen.getByText('Reenviado desde «ses_a»')).toBeTruthy()
  expect(screen.getByText('¿Qué archivos cambiaste hoy?')).toBeTruthy()
})

it('an owner message offers no child session nor review export of its own', async () => {
  const { TurnSessionContext } = await import('../features/activity/turnSession')
  render(
    <I18nProvider lang="es">
      <TurnSessionContext.Provider value="ses_live">
        <MessageBubble message={{ id: 'h12', role: 'user', content: 'Revisa el módulo de pagos entero', createdAt: 1, turnId: 'turn-live' }} />
      </TurnSessionContext.Provider>
    </I18nProvider>,
  )
  expect(screen.getByText('Revisa el módulo de pagos entero')).toBeTruthy()
  expect(screen.queryByRole('button')).toBeNull()
})

it('a message from a task that runs in its conversation names the task', () => {
  render(
    <I18nProvider lang="es">
      <MessageBubble
        message={{
          id: 'h13',
          role: 'user',
          content: 'Revisa otra vez el precio.',
          createdAt: 1,
          turnId: 'turn-task',
          origin: { kind: 'schedule', task_id: 'sch_1', run_id: 'run_1', task_name: 'Revisar el precio', target: 'this_conversation' } as never,
        }}
      />
    </I18nProvider>,
  )
  // A separator with its name, never the owner's bubble; the prompt stays folded (22-oct).
  const run = screen.getByTestId('scheduled-run')
  expect(run.querySelector('summary')?.textContent).toBe('Tarea programada · Revisar el precio')
  expect(run.hasAttribute('open')).toBe(false)
  expect(run.textContent).toContain('Revisa otra vez el precio.')
  expect(screen.queryByTestId('user-message-bubble')).toBeNull()
})

it('work that ended after its turn shows as a separator, not as words of the owner', () => {
  const woke = (source: string) => ({
    ...peerMessage,
    content: '[Rinari] Background work you asked to be woken for ended: render (exit code 0).',
    origin: { kind: 'automation' as const, source, source_label: 'render' },
  })
  const { rerender } = render(<I18nProvider lang="es"><MessageBubble message={woke('process_exit')} /></I18nProvider>)
  expect(screen.getByTestId('wake-separator').textContent).toBe('Terminó «render»: Rinari sigue')
  expect(screen.queryByTestId('user-message-bubble')).toBeNull()
  rerender(<I18nProvider lang="es"><MessageBubble message={woke('job_timeout')} /></I18nProvider>)
  expect(screen.getByTestId('wake-separator').textContent).toBe('«render» no terminó a tiempo: Rinari lo revisa')
})

// @vitest-environment jsdom
// Un turno que el motor cerró al caerse (#68): la tarjeta lo dice en español,
// sin el texto del Engine en inglés debajo, y el diagnóstico es una lista con
// etiquetas y «Copiar diagnóstico», no un JSON crudo.
import { installMockPlatform } from '../../test/mockPlatform'
installMockPlatform()
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vitest'
import { I18nProvider } from '../../i18n'
import TurnResult from './TurnResult'
import type { TurnTimeline } from './types'

afterEach(cleanup)

const ENGINE_TEXT = "Rinari's engine stopped before this turn finished, so it was closed as interrupted."

it('the engine that closed is said in Spanish, with a designed diagnostic', async () => {
  const timeline: TurnTimeline = {
    turnId: 't1', sessionId: 'ses_a', status: 'failed', startedAt: 1, userMessage: 'hola', items: [],
    error: ENGINE_TEXT, errorCode: 'ENGINE_EXITED',
    errorDetails: { reason: 'engine_exited', recoverable: true, reconciled: true, partial_text: 'x' },
  }
  render(<I18nProvider lang="es"><TurnResult timeline={timeline} /></I18nProvider>)
  expect(screen.getByRole('alert').textContent).toContain('Rinari se cerró mientras este turno trabajaba')
  expect(screen.queryByText(ENGINE_TEXT)).toBeNull()
  const diagnostics = screen.getByTestId('failure-diagnostics')
  await userEvent.click(screen.getByText('Diagnóstico de la interrupción'))
  const rows = [...diagnostics.querySelectorAll('dt')].map((dt) => `${dt.textContent}: ${dt.nextElementSibling?.textContent}`)
  expect(rows).toEqual(['Código: ENGINE_EXITED', 'Motivo: el motor se cerró', 'Se puede continuar: sí', 'Cerrado al reabrir: sí'])
  expect(diagnostics.querySelector('pre')).toBeNull()
  expect(screen.getByRole('button', { name: 'Copiar diagnóstico' })).toBeTruthy()
})

it('a failure without a known cause is said by its code', () => {
  const timeline: TurnTimeline = {
    turnId: 't2', sessionId: 'ses_a', status: 'failed', startedAt: 1, userMessage: 'x', items: [],
    error: 'Turn preparation timed out after 60 s', errorCode: 'TURN_PREPARATION_TIMEOUT',
  }
  render(<I18nProvider lang="es"><TurnResult timeline={timeline} /></I18nProvider>)
  expect(screen.getByRole('alert').textContent).toBe('El turno tardó demasiado en prepararse. Vuelve a intentarlo.')
})

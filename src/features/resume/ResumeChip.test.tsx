// @vitest-environment jsdom
// Plan 0.4.0 #24: «Reanuda 17:40» mientras una conversación espera el
// restablecimiento del límite, con la cuenta atrás que avanza.
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import type { SessionResume } from '../../types/protocol.generated'
import { formatLeft, ResumeChip } from './ResumeChip'
import { useResumeStore } from './resumeStore'

const resume = (patch: Partial<SessionResume>): SessionResume => ({
  session_id: 'ses_a', provider_id: 'p', mode: 'at', resume_at: new Date(Date.now() + 90_000).toISOString(), state: 'waiting',
  attempts: 0, goal_id: null, reason: '', revision: 1, updated_at: new Date().toISOString(), ...patch,
})

afterEach(() => { cleanup(); vi.useRealTimers(); useResumeStore.setState({ bySession: {} }) })

it('formatea lo que falta: mm:ss en la última hora y horas antes', () => {
  expect(formatLeft(90_000)).toBe('01:30')
  expect(formatLeft(0)).toBe('00:00')
  expect(formatLeft(3_900_000)).toBe('1 h 05 min')
})

it('sale solo mientras espera, y la cuenta atrás avanza', () => {
  vi.useFakeTimers()
  const view = render(<I18nProvider lang="es"><ResumeChip sessionId="ses_a" /></I18nProvider>)
  expect(screen.queryByTestId('resume-chip')).toBeNull()
  act(() => useResumeStore.getState().apply('ses_a', resume({})))
  const chip = screen.getByTestId('resume-chip')
  expect(chip.getAttribute('aria-label')).toMatch(/^Reanuda /)
  expect(chip.textContent).toContain('01:30')
  act(() => { vi.advanceTimersByTime(2000) })
  expect(chip.textContent).toContain('01:28')
  act(() => useResumeStore.getState().apply('ses_a', resume({ state: 'cancelled', revision: 2 })))
  expect(screen.queryByTestId('resume-chip')).toBeNull()
  view.unmount()
})

it('en la barra lateral es compacto y sin cuenta atrás; esperando saldo no da hora', () => {
  useResumeStore.getState().apply('ses_a', resume({ mode: 'poll' }))
  render(<I18nProvider lang="es"><ResumeChip sessionId="ses_a" compact /></I18nProvider>)
  const chip = screen.getByTestId('resume-chip')
  expect(chip.getAttribute('aria-label')).toBe('Reanuda con saldo')
  expect(chip.querySelector('.resume-chip-left')).toBeNull()
})

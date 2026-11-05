// @vitest-environment jsdom
// H-20: el razonamiento que se ve es el elegido o, si no se eligió, el que usó el último turno.
import { beforeEach, expect, it } from 'vitest'
import { syncReasoningFromTurn, useSessionUiStore } from './sessionUi'

beforeEach(() => {
  useSessionUiStore.setState({ bySession: {} })
})

it('a turn that ran with an effort becomes the shown (and next) effort when none was chosen', () => {
  syncReasoningFromTurn({ session_id: 'ses_a', turn_id: 't1', reasoning_effort: 'high' })
  expect(useSessionUiStore.getState().reasoningFor('ses_a')).toBe('high')
})

it("never overrides the owner's choice, nor reacts to a default or unknown effort", () => {
  useSessionUiStore.getState().setReasoningFor('ses_a', 'low')
  syncReasoningFromTurn({ session_id: 'ses_a', reasoning_effort: 'high' })
  expect(useSessionUiStore.getState().reasoningFor('ses_a')).toBe('low')
  syncReasoningFromTurn({ session_id: 'ses_b', reasoning_effort: null })
  syncReasoningFromTurn({ session_id: 'ses_b', reasoning_effort: 'turbo' })
  syncReasoningFromTurn({ reasoning_effort: 'high' })
  expect(useSessionUiStore.getState().reasoningFor('ses_b')).toBe('off')
  expect(Object.keys(useSessionUiStore.getState().bySession)).toEqual(['ses_a'])
})

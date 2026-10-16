// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { engineApi } from '../../services/engine'
import type { Goal } from '../../types/protocol.generated'
import { GoalDock } from './GoalDock'
import { applyGoalEvent, useGoalStore } from './goalStore'
import { runUiCommand } from '../engine/slashUi'
import MessageBubble from '../../components/MessageBubble'

function goal(partial: Partial<Goal> = {}): Goal {
  return {
    session_id: 's1',
    goal_id: 'goal_1',
    objective: 'Que los tests pasen',
    state: 'pursuing',
    budget: {},
    iteration: 3,
    tokens_used: 12000,
    active_seconds: 300,
    assessment: {},
    reason: '',
    revision: 4,
    started_at: '',
    updated_at: '',
    ...partial,
  }
}

function mount(onHint = vi.fn()) {
  return render(<I18nProvider lang="es"><GoalDock sessionId="s1" onHint={onHint} /></I18nProvider>)
}

beforeEach(() => {
  useGoalStore.setState({ bySession: {} })
  vi.spyOn(engineApi, 'sessionGoal').mockResolvedValue({ goal: null })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('GoalDock (plan 0.4.0 #23)', () => {
  it('shows nothing without a goal', async () => {
    mount()
    await waitFor(() => expect(engineApi.sessionGoal).toHaveBeenCalled())
    expect(screen.queryByTestId('goal-dock')).toBeNull()
  })

  it('shows the objective, state, iteration, time and tokens, and pauses', async () => {
    vi.mocked(engineApi.sessionGoal).mockResolvedValue({ goal: goal() })
    const pause = vi.spyOn(engineApi, 'goalPause').mockResolvedValue({ goal: goal({ state: 'paused', revision: 5, reason: 'paused by the owner' }) })
    mount()
    const dock = await screen.findByTestId('goal-dock')
    expect(dock.textContent).toContain('Que los tests pasen')
    expect(dock.textContent).toContain('Persiguiendo')
    expect(dock.textContent).toContain('Iteración 3')
    expect(dock.textContent).toContain('5 min')
    await userEvent.click(screen.getByRole('button', { name: /Pausar/ }))
    expect(pause).toHaveBeenCalledWith('s1')
    await waitFor(() => expect(screen.getByTestId('goal-dock').getAttribute('data-state')).toBe('paused'))
    expect(screen.getByRole('button', { name: /Reanudar/ })).toBeTruthy()
  })

  it('a stalled goal takes a hint: resumes without a turn, then sends it', async () => {
    vi.mocked(engineApi.sessionGoal).mockResolvedValue({ goal: goal({ state: 'stalled', reason: '3 iterations in a row without progress' }) })
    const resume = vi.spyOn(engineApi, 'goalResume').mockResolvedValue({ goal: goal({ state: 'pursuing', revision: 6 }) })
    const onHint = vi.fn()
    mount(onHint)
    expect(await screen.findByText('3 iterations in a row without progress')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Darle una pista' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Darle una pista' }), 'Prueba con el puerto 8080{Enter}')
    await waitFor(() => expect(onHint).toHaveBeenCalledWith('Prueba con el puerto 8080'))
    expect(resume).toHaveBeenCalledWith('s1', { start: false })
  })

  it('an achieved goal shows its evidence', async () => {
    vi.mocked(engineApi.sessionGoal).mockResolvedValue({ goal: goal({ state: 'achieved', assessment: { status: 'achieved', summary: 'listo', evidence: '42 passed' } }) })
    mount()
    expect(await screen.findByText('Evidencia: 42 passed')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Quitar/ })).toBeTruthy()
  })

  it('live events update it and an older revision never comes back', async () => {
    mount()
    applyGoalEvent({ session_id: 's1', goal: goal({ revision: 9, iteration: 5 }) })
    expect((await screen.findByTestId('goal-dock')).textContent).toContain('Iteración 5')
    applyGoalEvent({ session_id: 's1', goal: goal({ revision: 8, iteration: 4 }) })
    expect(screen.getByTestId('goal-dock').textContent).toContain('Iteración 5')
  })
})

describe('/goal', () => {
  const deps = { sessionId: 's1', reveal: vi.fn(), fork: vi.fn(), rename: vi.fn() }

  it('sets the goal and starts it', async () => {
    const set = vi.spyOn(engineApi, 'goalSet').mockResolvedValue({ goal: goal({ iteration: 1 }), turn: { turn_id: 't1' } })
    expect(await runUiCommand('goal', 'Que los tests pasen', deps)).toBe(true)
    expect(set).toHaveBeenCalledWith('s1', 'Que los tests pasen')
    expect(useGoalStore.getState().bySession.s1.goal?.iteration).toBe(1)
  })

  it('pause, resume and clear manage it', async () => {
    const pause = vi.spyOn(engineApi, 'goalPause').mockResolvedValue({ goal: goal({ state: 'paused' }) })
    const clear = vi.spyOn(engineApi, 'goalClear').mockResolvedValue({ goal: null })
    await runUiCommand('goal', 'pause', deps)
    await runUiCommand('goal', 'clear', deps)
    expect(pause).toHaveBeenCalledWith('s1')
    expect(clear).toHaveBeenCalledWith('s1')
    expect(useGoalStore.getState().bySession.s1.goal).toBeNull()
  })
})

describe('goal turns in the conversation', () => {
  it('show as a separator, not as something the owner wrote', () => {
    render(
      <I18nProvider lang="es">
        <MessageBubble message={{ id: 'm1', role: 'user', createdAt: 0, content: 'Runtime: goal, iteration 2…', origin: { kind: 'user', source: 'goal', goal_id: 'goal_1', iteration: 2 } }} />
      </I18nProvider>,
    )
    expect(screen.getByTestId('goal-separator').textContent).toBe('Continuando el objetivo · 2')
    expect(screen.queryByTestId('user-message-bubble')).toBeNull()
  })

  it('the first goal turn says it is starting', () => {
    render(
      <I18nProvider lang="es">
        <MessageBubble message={{ id: 'm1', role: 'user', createdAt: 0, content: 'Runtime: goal, iteration 1…', origin: { kind: 'user', source: 'goal', goal_id: 'goal_1', iteration: 1 } }} />
      </I18nProvider>,
    )
    expect(screen.getByTestId('goal-separator').textContent).toBe('Empezando el objetivo')
  })
})

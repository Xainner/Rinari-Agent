// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { engineApi, type SessionSummary } from '../../services/engine'
import { isPresenceSession, partitionSessions } from '../engine/sessionVisibility'
import { usePresenceStore } from '../../stores/presence'
import PresenceBar from './PresenceBar'
import PresencePanel from './PresencePanel'
import PresenceSettings from './PresenceSettings'

function row(id: string, partial: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id,
    kind: 'CHAT',
    title: id,
    mode: 'build',
    state: 'active',
    updated_at: '2026-11-16T00:00:00.000Z',
    project_id: null,
    project_root: null,
    current_cwd: null,
    git_branch: null,
    last_active_at: '2026-11-16T00:00:00.000Z',
    provider_id: 'p',
    model_id: 'm',
    permission_profile: 'full-access',
    effective_permission_profile: 'full-access',
    ...partial,
  }
}

const presenceRow = row('ses_presence', { title: 'Rinari', lineage_kind: 'presence' })
const off = { presence: { enabled: false, session: null } }
const on = { presence: { enabled: true, session: presenceRow } }

beforeEach(() => {
  usePresenceStore.setState({ supported: false, loaded: false, enabled: false, sessionId: null, session: null, full: false })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

const wrap = (node: React.ReactNode) => render(<I18nProvider lang="es">{node}</I18nProvider>)

describe('Presencia: the conversation is not one of the chats', () => {
  it('is told apart by its lineage', () => {
    expect(isPresenceSession(presenceRow)).toBe(true)
    expect(isPresenceSession(row('a'))).toBe(false)
    expect(isPresenceSession(row('b', { lineage_kind: 'fork' }))).toBe(false)
    expect(isPresenceSession(null)).toBe(false)
  })

  it('stays out of the visible, closed and archived lists', () => {
    const parts = partitionSessions([
      row('a'),
      presenceRow,
      row('c', { state: 'closed' }),
      row('d', { state: 'archived', lineage_kind: 'presence' }),
    ])
    expect(parts.visible.map((item) => item.id)).toEqual(['a'])
    expect(parts.closed.map((item) => item.id)).toEqual(['c'])
    expect(parts.archived).toEqual([])
  })
})

describe('Presencia: the store', () => {
  it('offers nothing on an Engine without the mode, and never asks it', async () => {
    const get = vi.spyOn(engineApi, 'presenceGet').mockResolvedValue(on)
    await usePresenceStore.getState().load(false)
    expect(get).not.toHaveBeenCalled()
    expect(usePresenceStore.getState()).toMatchObject({ supported: false, loaded: false, enabled: false, sessionId: null })
  })

  it('remembers the conversation the Engine gives', async () => {
    vi.spyOn(engineApi, 'presenceGet').mockResolvedValue(on)
    await usePresenceStore.getState().load(true)
    expect(usePresenceStore.getState()).toMatchObject({ supported: true, loaded: true, enabled: true, sessionId: 'ses_presence' })
  })

  it('leaves the full mode when the mode is turned off', async () => {
    vi.spyOn(engineApi, 'presenceGet').mockResolvedValue(on)
    vi.spyOn(engineApi, 'presenceSet').mockResolvedValue(off)
    await usePresenceStore.getState().load(true)
    usePresenceStore.getState().setFull(true)
    expect(usePresenceStore.getState().full).toBe(true)
    await usePresenceStore.getState().setEnabled(false)
    expect(usePresenceStore.getState()).toMatchObject({ enabled: false, sessionId: null, full: false })
    // Off, «Entrar» does nothing.
    usePresenceStore.getState().setFull(true)
    expect(usePresenceStore.getState().full).toBe(false)
  })
})

describe('Presencia: settings', () => {
  it('turns the mode on through the Engine', async () => {
    vi.spyOn(engineApi, 'presenceGet').mockResolvedValue(off)
    const set = vi.spyOn(engineApi, 'presenceSet').mockResolvedValue(on)
    await usePresenceStore.getState().load(true)
    wrap(<PresenceSettings />)
    const toggle = screen.getByRole('switch', { name: 'Activar Presencia' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    await userEvent.click(toggle)
    expect(set).toHaveBeenCalledWith(true)
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'))
    expect(usePresenceStore.getState().sessionId).toBe('ses_presence')
  })

  it('keeps the switch as it was when the Engine refuses', async () => {
    vi.spyOn(engineApi, 'presenceGet').mockResolvedValue(off)
    vi.spyOn(engineApi, 'presenceSet').mockRejectedValue(new Error('nope'))
    await usePresenceStore.getState().load(true)
    wrap(<PresenceSettings />)
    const toggle = screen.getByRole('switch', { name: 'Activar Presencia' })
    await userEvent.click(toggle)
    await waitFor(() => expect((toggle as HTMLButtonElement).disabled).toBe(false))
    expect(toggle.getAttribute('aria-checked')).toBe('false')
  })

  it('says so, without a switch, on an Engine without the mode', () => {
    wrap(<PresenceSettings />)
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.getByText('Esta versión de Rinari todavía no tiene Presencia.')).toBeTruthy()
  })
})

describe('Presencia: the bar and the panel say only what is happening', () => {
  it('is calm with nothing going on', () => {
    wrap(<PresenceBar working={0} waiting={0} full={false} onToggleFull={() => undefined} />)
    expect(screen.getByTestId('presence-status').textContent).toBe('Todo en calma')
    expect(screen.getByRole('button', { name: 'Entrar' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('counts the chats working and the ones waiting for the owner', () => {
    wrap(<PresenceBar working={2} waiting={1} full onToggleFull={() => undefined} />)
    expect(screen.getByTestId('presence-status').textContent).toBe('2 chats trabajando · 1 te espera')
    expect(screen.getByRole('button', { name: 'Salir' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('toggles the full mode', async () => {
    const toggle = vi.fn()
    wrap(<PresenceBar working={0} waiting={0} full={false} onToggleFull={toggle} />)
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(toggle).toHaveBeenCalledTimes(1)
  })

  it('lists each chat and opens it', async () => {
    const open = vi.fn()
    wrap(
      <PresencePanel
        waiting={[{ id: 's1', title: 'Login del panel', project: 'gateway' }]}
        working={[]}
        onOpen={open}
      />,
    )
    expect(screen.getByText('Ningún chat trabaja ahora.')).toBeTruthy()
    expect(screen.getByText('gateway')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: /Login del panel/ }))
    expect(open).toHaveBeenCalledWith('s1')
  })
})

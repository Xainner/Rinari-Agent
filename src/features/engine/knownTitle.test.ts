import { describe, expect, it } from 'vitest'
import { useTitleMotionStore } from '../../stores/titleMotion'
import { withKnownTitle } from './useSessionList'
import type { SessionSummary } from '../../services/engine'

const row = (title: string) => ({ id: 'ses_1', title } as SessionSummary)

describe('a stale row never takes back an automatic title', () => {
  it('keeps the title the Engine announced over an older «New conversation»', () => {
    useTitleMotionStore.getState().mark('ses_1', 'Revisar menú y puntos', 'generated')
    expect(withKnownTitle(row('Nueva conversación')).title).toBe('Revisar menú y puntos')
    expect(withKnownTitle(row('New conversation')).title).toBe('Revisar menú y puntos')
    // A title the owner gave afterwards is the row's own.
    expect(withKnownTitle(row('Mi nombre')).title).toBe('Mi nombre')
  })
})

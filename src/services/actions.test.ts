import { describe, expect, it } from 'vitest'
import { resolveContextualAction } from './actions'

describe('contextual desktop actions', () => {
  it('routes new/close to the pane lifecycle in Boards and to sessions elsewhere', () => {
    expect(resolveContextualAction('new', { view: 'board' })).toBe('add-pane')
    expect(resolveContextualAction('close', { view: 'board' })).toBe('remove-pane')
    expect(resolveContextualAction('new', { view: 'chat' })).toBe('new-chat')
    expect(resolveContextualAction('close', { view: 'chat' })).toBe('close-session')
    expect(resolveContextualAction('new', { view: 'settings' })).toBe('new-chat')
  })
})

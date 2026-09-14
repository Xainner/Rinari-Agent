import { describe, expect, it } from 'vitest'
import { applicableSuggestions, suggestionPage } from './suggestions'
import { groupRecentChats } from '../projects/workspaceModel'
import type { SessionSummary } from '../../services/engine'
describe('contextual suggestions', () => {
  it('uses general actions when project and Git are unknown', () => {
    const items = applicableSuggestions({ projectName: null, changedFiles: null, attachmentCount: 0 })
    expect(suggestionPage(items, 0).map(item => item.id)).toEqual(['code', 'plan', 'concept', 'file'])
    expect(items.every(item => item.group === 'general')).toBe(true)
    expect(suggestionPage(items, 4).map(item => item.id)).not.toEqual(suggestionPage(items, 0).map(item => item.id))
    expect(new Set(suggestionPage(items, 4).map(item => item.id)).size).toBe(4)
  })
  it('prioritizes attachments, then known Git changes, then project', () => {
    const context = { projectName: 'Rinari', changedFiles: 3, attachmentCount: 2 }
    expect(suggestionPage(applicableSuggestions(context), 0).map(item => item.id)).toEqual(['analyze', 'explain', 'compare', 'fileplan'])
    expect(applicableSuggestions({ ...context, attachmentCount: 1 }).some(item => item.id === 'compare')).toBe(false)
    expect(suggestionPage(applicableSuggestions({ ...context, attachmentCount: 0 }), 0).every(item => item.group === 'git')).toBe(true)
    expect(suggestionPage(applicableSuggestions({ ...context, attachmentCount: 0, changedFiles: null }), 0).every(item => item.group === 'project')).toBe(true)
  })
})
it('groups chats using local calendar boundaries and sorts newest first', () => {
  const now = new Date(2026, 8, 14, 13)
  const chat = (id: string, day: number) => ({ id, last_active_at: new Date(2026, 8, day, 12).toISOString() }) as SessionSummary
  expect(groupRecentChats([chat('old', 1), chat('yesterday', 13), chat('today', 14), chat('week', 8)], now).map(group => [group.key, group.sessions.map(item => item.id)])).toEqual([
    ['today', ['today']], ['yesterday', ['yesterday']], ['week', ['week']], ['older', ['old']],
  ])
})

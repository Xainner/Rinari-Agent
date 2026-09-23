// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { conversationPresentation } from './ChatView'

describe('conversationPresentation', () => {
  it('never treats an unknown or failed history as an empty conversation', () => {
    expect(conversationPresentation('unloaded', 0)).toBe('loading')
    expect(conversationPresentation('loading', 0)).toBe('loading')
    expect(conversationPresentation('error', 0)).toBe('error')
  })

  it('moves the first optimistic message directly into conversation mode', () => {
    expect(conversationPresentation('loaded', 0)).toBe('empty')
    expect(conversationPresentation('loaded', 1)).toBe('conversation')
  })
})

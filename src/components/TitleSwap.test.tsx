// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TitleSwap } from './TitleSwap'
import { markRenamedFromEvent, useTitleMotionStore } from '../stores/titleMotion'

const swapping = () => document.querySelector('[data-title-swap="in"]')
const outgoing = () => document.querySelector('.title-swap-out')

describe('TitleSwap', () => {
  beforeEach(() => {
    cleanup()
    useTitleMotionStore.setState({ renamed: {} })
  })

  it('animates a live rename by Rinari once, then settles', () => {
    vi.useFakeTimers()
    const { rerender } = render(<TitleSwap sessionId="s1" text="Nueva conversación" />)
    expect(swapping()).toBeNull()
    act(() => markRenamedFromEvent({ session_id: 's1', title: 'Poema sobre huskies', previous_title: 'Nueva conversación', source: 'generated' }))
    rerender(<TitleSwap sessionId="s1" text="Poema sobre huskies" />)
    expect(swapping()?.textContent).toBe('Poema sobre huskies')
    expect(outgoing()?.textContent).toBe('Nueva conversación')
    expect(outgoing()?.getAttribute('aria-hidden')).toBe('true')
    act(() => { vi.advanceTimersByTime(700) })
    expect(swapping()).toBeNull()
    expect(outgoing()).toBeNull()
    expect(screen.getByText('Poema sobre huskies')).toBeTruthy()
    vi.useRealTimers()
  })

  it('does not replay when the conversation is opened later', () => {
    markRenamedFromEvent({ session_id: 's1', title: 'Poema sobre huskies', source: 'generated' })
    render(<TitleSwap sessionId="s1" text="Poema sobre huskies" />)
    expect(swapping()).toBeNull()
  })

  it('does not animate switching to another conversation', () => {
    const { rerender } = render(<TitleSwap sessionId="s1" text="Uno" />)
    markRenamedFromEvent({ session_id: 's2', title: 'Dos', source: 'generated' })
    rerender(<TitleSwap sessionId="s2" text="Dos" />)
    expect(swapping()).toBeNull()
  })

  it("leaves the user's own renames and unrecorded changes still", () => {
    const { rerender } = render(<TitleSwap sessionId="s1" text="Uno" />)
    markRenamedFromEvent({ session_id: 's1', title: 'Mío', source: 'manual' })
    rerender(<TitleSwap sessionId="s1" text="Mío" />)
    expect(swapping()).toBeNull()
    rerender(<TitleSwap sessionId="s1" text="Sin evento" />)
    expect(swapping()).toBeNull()
  })

  it('ignores malformed events', () => {
    markRenamedFromEvent(null)
    markRenamedFromEvent({ title: 'x' })
    expect(useTitleMotionStore.getState().renamed).toEqual({})
  })
})

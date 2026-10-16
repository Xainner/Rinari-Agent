import { describe, expect, it } from 'vitest'

import { AGENT_ECHO_MS, OwnerActivity, SUSTAINED_MOVE_MS } from './ownerActivity'

function clock() {
  let at = 1_000
  return { now: () => at, advance: (ms: number) => { at += ms } }
}

describe('OwnerActivity (plan 0.4.0 #46)', () => {
  it('a click, the wheel or a key is the owner using the page', () => {
    const time = clock()
    const owner = new OwnerActivity(time.now)
    for (const kind of ['mouseDown', 'mouseWheel', 'keyDown', 'contextMenu'] as const) {
      expect(owner.observe(kind)).toBe(true)
    }
    expect(owner.observe('mouseUp')).toBe(false)
    expect(owner.observe('keyUp')).toBe(false)
  })

  it('passing the mouse over the page does not take it; staying a moment does', () => {
    const time = clock()
    const owner = new OwnerActivity(time.now)
    expect(owner.observe('mouseMove')).toBe(false)
    time.advance(100)
    expect(owner.observe('mouseMove')).toBe(false)
    owner.observe('mouseLeave')
    // Otra pasada empieza de cero.
    time.advance(100)
    expect(owner.observe('mouseMove')).toBe(false)
    for (let elapsed = 0; elapsed < SUSTAINED_MOVE_MS; elapsed += 100) {
      time.advance(100)
      owner.observe('mouseMove')
    }
    expect(owner.observe('mouseMove')).toBe(true)
  })

  it('a pause between moves starts a new pass', () => {
    const time = clock()
    const owner = new OwnerActivity(time.now)
    owner.observe('mouseMove')
    time.advance(SUSTAINED_MOVE_MS + 10)
    expect(owner.observe('mouseMove')).toBe(false)
  })

  it('what the agent dispatches, and its echo, is not the owner', () => {
    const time = clock()
    const owner = new OwnerActivity(time.now)
    owner.beginAgentInput()
    expect(owner.observe('mouseDown')).toBe(false)
    expect(owner.observe('keyDown')).toBe(false)
    owner.endAgentInput()
    time.advance(AGENT_ECHO_MS - 1)
    expect(owner.observe('mouseDown')).toBe(false)
    time.advance(2)
    expect(owner.observe('mouseDown')).toBe(true)
  })
})

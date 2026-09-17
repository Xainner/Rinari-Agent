import { describe, expect, it } from 'vitest'
import { decideChannels, nativeBody } from './notificationPolicy'

const prefs = { toasts: true, system: true, needsYou: true, systemDetails: false }
const supported = { canSend: true, canActivateTarget: false }
const unsupported = { canSend: false, canActivateTarget: false }

describe('notification channel policy', () => {
  it('toasts a terminal the user is not attending; suppresses it when the result is visible', () => {
    expect(decideChannels({ kind: 'terminal', prefs, windowAttended: true, targetVisible: false, support: unsupported, permission: 'unsupported' })).toEqual({ toast: true, system: false })
    expect(decideChannels({ kind: 'terminal', prefs, windowAttended: true, targetVisible: true, support: unsupported, permission: 'unsupported' })).toEqual({ toast: false, system: false })
  })

  it('interventions additionally require needsYou; toasts never enable the system channel', () => {
    expect(decideChannels({ kind: 'intervention', prefs: { ...prefs, needsYou: false }, windowAttended: false, targetVisible: false, support: supported, permission: 'granted' })).toEqual({ toast: false, system: false })
    expect(decideChannels({ kind: 'terminal', prefs: { ...prefs, system: false }, windowAttended: false, targetVisible: false, support: supported, permission: 'granted' })).toEqual({ toast: true, system: false })
  })

  it('uses the system channel only with support, permission and an unattended window, and then skips the toast', () => {
    expect(decideChannels({ kind: 'terminal', prefs, windowAttended: false, targetVisible: false, support: supported, permission: 'granted' })).toEqual({ toast: false, system: true })
    expect(decideChannels({ kind: 'terminal', prefs, windowAttended: true, targetVisible: false, support: supported, permission: 'granted' })).toEqual({ toast: true, system: false })
    expect(decideChannels({ kind: 'terminal', prefs, windowAttended: false, targetVisible: false, support: supported, permission: 'denied' })).toEqual({ toast: true, system: false })
    expect(decideChannels({ kind: 'terminal', prefs, windowAttended: false, targetVisible: false, support: unsupported, permission: 'granted' })).toEqual({ toast: true, system: false })
  })

  it('peer events never use these channels (they have their own toast)', () => {
    expect(decideChannels({ kind: 'peer', prefs, windowAttended: false, targetVisible: false, support: supported, permission: 'granted' })).toEqual({ toast: false, system: false })
  })

  it('native bodies stay generic unless details are enabled, and never carry content', () => {
    expect(nativeBody('terminal', { label: 'Backend', provider: 'openai', model: 'gpt' }, false)).toBe('Un panel necesita revisión')
    expect(nativeBody('intervention', null, true)).toBe('Un panel necesita tu intervención')
    expect(nativeBody('terminal', { label: 'Backend', provider: 'openai', model: 'gpt' }, true)).toBe('Backend · openai › gpt')
  })
})

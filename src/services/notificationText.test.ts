import { describe, expect, it } from 'vitest'
import { BODY_MAX, notificationText, plainExcerpt } from './notificationText'
import { APP_NAME } from '../lib/channel'

describe('notification text (#64)', () => {
  it('turns markdown into one plain line, without code blocks, and cuts it', () => {
    expect(plainExcerpt('## Hecho\n\n- **uno** con [enlace](http://x)\n- `dos`\n\n```js\nsecret()\n```\nfin')).toBe('Hecho uno con enlace dos fin')
    expect(plainExcerpt('a'.repeat(400)).length).toBe(BODY_MAX)
  })

  it('names the conversation and says what happened, by outcome', () => {
    expect(notificationText({ outcome: 'plan', conversation: 'Web', project: 'rinari-web', detail: 'Migrar la base' }, 'es', true))
      .toEqual({ title: 'Web · rinari-web', body: 'El plan está listo: Migrar la base' })
    expect(notificationText({ outcome: 'needsYou', conversation: 'Web', detail: 'npm install' }, 'es', true).body).toBe('Te necesita: npm install')
    expect(notificationText({ outcome: 'failed', conversation: 'Web', detail: 'sin saldo' }, 'en', true).body).toBe('Failed: sin saldo')
    expect(notificationText({ outcome: 'done', conversation: 'Web', detail: '' }, 'es', true).body).toBe('«Web» terminó.')
  })

  it('with content off it only says which conversation, never the answer', () => {
    const text = notificationText({ outcome: 'done', conversation: 'Web', detail: 'la clave es 1234' }, 'es', false)
    expect(text).toEqual({ title: APP_NAME, body: '«Web» terminó.' })
  })
})

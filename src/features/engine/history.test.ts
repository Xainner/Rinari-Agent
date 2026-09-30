import { describe, expect, it } from 'vitest'
import { historyTimestamp, historyToMessages } from './history'
import type { HistoryMessage } from '../../services/engine'

function row(partial: Partial<HistoryMessage> & { seq: number }): HistoryMessage {
  const { seq, ...rest } = partial
  return {
    id: `r${seq}`,
    seq,
    role: 'user',
    content: '',
    tool_calls: null,
    tool_call_id: null,
    name: null,
    created_at: '2026-09-01T10:00:00.000Z',
    ...rest,
  }
}

describe('historyToMessages', () => {
  it('conserva timestamps y orden por seq', () => {
    const messages = historyToMessages([
      row({ seq: 3, role: 'assistant', content: 'tercero', created_at: '2026-09-01T10:02:00.000Z' }),
      row({ seq: 1, role: 'user', content: 'primero', created_at: '2026-09-01T10:00:00.000Z' }),
      row({ seq: 2, role: 'assistant', content: 'segundo', created_at: '2026-09-01T10:01:00.000Z' }),
    ])
    expect(messages.map((m) => m.content)).toEqual(['primero', 'segundo', 'tercero'])
    expect(messages[0].createdAt).toBe(Date.parse('2026-09-01T10:00:00.000Z'))
    expect(messages[2].createdAt).toBe(Date.parse('2026-09-01T10:02:00.000Z'))
    expect(messages.map((m) => m.id)).toEqual(['h1', 'h2', 'h3'])
  })

  it('nunca sintetiza tool calls como texto de chat', () => {
    const messages = historyToMessages([
      row({
        seq: 1,
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'c1', name: 'shell', arguments: '{}' }],
      }),
      row({ seq: 2, role: 'assistant', content: 'respuesta', created_at: '2026-09-01T10:01:00.000Z' }),
    ])
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('respuesta')
  })

  it('omite las notas del runtime aunque viajen como mensaje de usuario', () => {
    const messages = historyToMessages([
      row({ seq: 1, role: 'user', content: 'Arregla el total' }),
      row({
        seq: 2,
        role: 'user',
        content: '[harness loop-detector] repeated-rewrites: src/order.js…',
        origin: { kind: 'harness', source: 'loop-detector' },
      }),
    ])
    expect(messages.map((m) => m.content)).toEqual(['Arregla el total'])
  })

  it('omite roles no conversacionales', () => {
    const messages = historyToMessages([
      row({ seq: 1, role: 'tool', content: 'salida', tool_call_id: 'c1' }),
      row({ seq: 2, role: 'user', content: 'hola' }),
    ])
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('user')
  })

  it('timestamp inválido cae a 0 de forma determinista', () => {
    expect(historyTimestamp('no-fecha')).toBe(0)
    expect(historyTimestamp('2026-09-01T10:00:00.000Z')).toBe(
      Date.parse('2026-09-01T10:00:00.000Z'),
    )
  })
})

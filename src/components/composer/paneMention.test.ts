import { describe, expect, it } from 'vitest'
import { matchPaneTargets, paneMentionQuery, parsePaneMention } from './paneMention'

const targets = [
  { id: 'ses_b', label: 'Docs' },
  { id: 'ses_c', label: 'Backend API' },
  { id: 'ses_d', label: 'Backend' },
]

describe('pane mention', () => {
  it('parses @Label message with the longest matching label, case and accent insensitive', () => {
    expect(parsePaneMention('@Docs revisá el README', targets)).toEqual({ target: targets[0], message: 'revisá el README' })
    expect(parsePaneMention('@backend api arregla el build', targets)).toEqual({ target: targets[1], message: 'arregla el build' })
    expect(parsePaneMention('@Backend hola', targets)).toEqual({ target: targets[2], message: 'hola' })
    expect(parsePaneMention('@dócs\nvarias líneas', targets)?.message).toBe('varias líneas')
  })

  it('leaves file references and unknown handles alone', () => {
    expect(parsePaneMention('@README.md explica esto', targets)).toBeNull()
    expect(parsePaneMention('@Docsx hola', targets)).toBeNull()
    expect(parsePaneMention('hola @Docs', targets)).toBeNull()
    expect(parsePaneMention('@Docs hola', [])).toBeNull()
  })

  it('reports an empty message for a bare mention', () => {
    expect(parsePaneMention('@Docs', targets)).toEqual({ target: targets[0], message: '' })
    expect(parsePaneMention('@Docs   ', targets)?.message).toBe('')
  })

  it('offers autocomplete only while typing the first token, ranking prefix matches first', () => {
    expect(paneMentionQuery('@')).toBe('')
    expect(paneMentionQuery('@ba')).toBe('ba')
    expect(paneMentionQuery('@Docs hola')).toBeNull()
    expect(paneMentionQuery('hola @Do')).toBeNull()
    expect(matchPaneTargets('', targets).map((t) => t.label)).toEqual(['Docs', 'Backend API', 'Backend'])
    expect(matchPaneTargets('end', targets).map((t) => t.label)).toEqual(['Backend API', 'Backend'])
    expect(matchPaneTargets('BACK', targets).map((t) => t.label)).toEqual(['Backend API', 'Backend'])
    expect(matchPaneTargets('zzz', targets)).toEqual([])
  })
})

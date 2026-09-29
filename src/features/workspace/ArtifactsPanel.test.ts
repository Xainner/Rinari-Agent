import { describe, expect, it } from 'vitest'
import { producedArtifacts } from './ArtifactsPanel'

describe('producedArtifacts', () => {
  it('refreshes after a tool that saved an artifact and at the end of a turn', () => {
    expect(producedArtifacts('tool.completed', { presentation: { artifacts: ['artifact://s/media/a.png'] } })).toBe(true)
    expect(producedArtifacts('tool.completed', { observation: '{"data":{"uri":"artifact://s/x"}}' })).toBe(true)
    expect(producedArtifacts('turn.completed', {})).toBe(true)
  })

  it('ignores tools that saved nothing', () => {
    expect(producedArtifacts('tool.completed', { presentation: { artifacts: [] }, observation: '{"ok":true}' })).toBe(false)
    expect(producedArtifacts('model.content.delta', {})).toBe(false)
  })
})

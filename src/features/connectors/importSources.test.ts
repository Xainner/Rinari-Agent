import { describe, expect, it } from 'vitest'
import { sourceRows } from './importSources'

const at = (source: string, path: string, found: boolean, variant?: string) => ({ source, label: source, variant, path, found, servers: 0 })

describe('where the import looked', () => {
  it('lists each found place and one line for an app found nowhere', () => {
    const rows = sourceRows([
      at('Claude Desktop', 'a/claude.json', true),
      at('Claude Desktop', 'b/claude.json', false, 'Microsoft Store'),
      at('VS Code', 'c/mcp.json', false, 'mcp.json'),
      at('VS Code', 'c/settings.json', false, 'settings.json'),
    ])
    expect(rows.map((row) => row.kind)).toEqual(['place', 'missing'])
    expect(rows[1]).toMatchObject({ kind: 'missing', label: 'VS Code', paths: ['c/mcp.json', 'c/settings.json'] })
  })
})

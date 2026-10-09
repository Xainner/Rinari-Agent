import { describe, expect, it } from 'vitest'
import { configFromForm, emptyForm, formFromServer, formReady, splitCommand } from './mcpForm'

describe('splitCommand', () => {
  it('keeps quoted arguments together and never invokes a shell', () => {
    expect(splitCommand('npx -y "@scope/my server" --flag')).toEqual(['npx', '-y', '@scope/my server', '--flag'])
    expect(splitCommand("  uvx  'mcp-git'  ")).toEqual(['uvx', 'mcp-git'])
  })
})

describe('configFromForm', () => {
  it('sends a bearer token for a remote server', () => {
    const form = { ...emptyForm(), name: 'gh', transport: 'http' as const, url: 'https://example.com/mcp', auth: 'bearer' as const, token: 'secret' }
    expect(formReady(form)).toBe(true)
    expect(configFromForm(form)).toEqual({ transport: 'http', url: 'https://example.com/mcp', auth: { kind: 'bearer', token: 'secret' } })
  })

  it('keeps a stored token when the field is left empty, and clears removed secrets', () => {
    const server = { name: 'gh', transport: 'http', command: '', url: 'https://example.com/mcp', scope: 'global', enabled: true, connected: false, updated_at: null, auth: { kind: 'headers' as const }, headers: [{ name: 'X-Api-Key', secret: true, configured: true }] }
    const form = formFromServer(server)
    expect(form.headers[0]).toMatchObject({ key: 'X-Api-Key', value: '', stored: true })
    expect(configFromForm({ ...form, headers: [] }, server)).toEqual({ transport: 'http', url: 'https://example.com/mcp', auth: { kind: 'headers' }, headers: { 'X-Api-Key': null } })
    const bearer = { ...form, auth: 'bearer' as const, tokenStored: true }
    expect(formReady(bearer)).toBe(true)
    expect(configFromForm(bearer, server).auth).toEqual({ kind: 'bearer' })
  })

  it('stores environment values of a local server as secrets', () => {
    const form = { ...emptyForm(), name: 'gh', command: 'npx -y server', env: [{ key: 'GITHUB_TOKEN', value: 'abc', secret: true }] }
    expect(configFromForm(form)).toEqual({ transport: 'stdio', command: ['npx', '-y', 'server'], env: { GITHUB_TOKEN: 'abc' } })
  })

  it('does not allow a remote server without an https address', () => {
    expect(formReady({ ...emptyForm(), name: 'x', transport: 'http', url: 'example.com' })).toBe(false)
  })
})

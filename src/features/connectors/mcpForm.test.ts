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

describe('OAuth', () => {
  it('signs in with registration when no client is given, and with the owner client when it is', () => {
    const form = { ...emptyForm(), name: 'notion', transport: 'http' as const, url: 'https://mcp.notion.com/mcp', auth: 'oauth' as const }
    expect(formReady(form)).toBe(true)
    expect(configFromForm(form)).toEqual({ transport: 'http', url: 'https://mcp.notion.com/mcp', auth: { kind: 'oauth' } })
    const own = { ...form, clientId: ' my-client ', clientSecret: 's3cret', scopes: 'read write', redirectPort: '8765' }
    expect(configFromForm(own).auth).toEqual({ kind: 'oauth', client_id: 'my-client', client_secret: 's3cret', scopes: ['read', 'write'], redirect_port: 8765 })
  })

  it('keeps a stored client secret, clears what the owner emptied and refuses a bad port', () => {
    const server = { name: 'slack', transport: 'http', command: '', url: 'https://mcp.slack.com/mcp', scope: 'global', enabled: true, connected: false, updated_at: null, auth: { kind: 'oauth' as const, client_id: 'abc', client_secret: { configured: true, source: 'stored' as const }, scopes: ['chat'], redirect_port: 8765 } }
    const form = formFromServer(server)
    expect(form).toMatchObject({ auth: 'oauth', clientId: 'abc', clientSecret: '', clientSecretStored: true, scopes: 'chat', redirectPort: '8765' })
    expect(configFromForm(form, server).auth).toEqual({ kind: 'oauth', client_id: 'abc', scopes: ['chat'], redirect_port: 8765 })
    expect(configFromForm({ ...form, clientId: '', clientSecretStored: false, scopes: '', redirectPort: '' }, server).auth).toEqual({ kind: 'oauth', client_id: null, client_secret: null, scopes: null, redirect_port: null })
    expect(formReady({ ...form, redirectPort: '80' })).toBe(false)
  })
})

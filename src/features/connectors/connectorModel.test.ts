import { describe, expect, it } from 'vitest'
import type { McpAuthStatus, McpCatalogEntry, McpServer } from '../../services/engine'
import {
  catalogByServer,
  connectorCapabilities,
  connectorState,
  displayName,
  hintKey,
  initials,
  primaryAction,
  sortConnectors,
  withLive,
} from './connectorModel'

const server = (patch: Partial<McpServer> = {}): McpServer => ({ name: 'notion', transport: 'http', command: '', url: 'https://mcp.notion.com/mcp', scope: 'global', enabled: true, connected: false, updated_at: null, ...patch })
const auth = (patch: Partial<McpAuthStatus> = {}): McpAuthStatus => ({ name: 'notion', kind: 'oauth', signed_in: false, reauth_required: false, has_refresh_token: false, scopes: [], ...patch })
const all = connectorCapabilities({ mcp_remote_v1: true, mcp_oauth_v1: true, mcp_background_connect_v1: true, mcp_tool_permissions_v1: true, mcp_catalog_v1: true })
const none = connectorCapabilities({})

describe('connectorState', () => {
  it('follows the background status and never calls a sign-in «connected»', () => {
    expect(connectorState(server({ status: 'connecting' }))).toBe('connecting')
    expect(connectorState(server({ status: 'connected', connected: true }))).toBe('connected')
    expect(connectorState(server({ status: 'error', connection: { hint: 'check_url_or_network', tools: 0, resources: false, attempts: 2 } }))).toBe('error')
    expect(connectorState(server({ status: 'reauth_required' }))).toBe('reauth')
    expect(connectorState(server({ enabled: false, status: 'connected' }))).toBe('disabled')
    // Google answers tools/list without signing in: connected, but the account is not.
    expect(connectorState(server({ status: 'connected', connected: true, auth: { kind: 'oauth' } }), auth())).toBe('signin')
    expect(connectorState(server({ status: 'connected', connected: true, auth: { kind: 'oauth' } }), auth({ signed_in: true }))).toBe('connected')
    expect(connectorState(server({ status: 'error', connection: { hint: 'oauth_required', tools: 0, resources: false, attempts: 1 } }))).toBe('signin')
  })

  it('without background status only says connected or not', () => {
    expect(connectorState(server({ connected: true }))).toBe('connected')
    expect(connectorState(server())).toBe('idle')
  })

  it('takes the live event over the listed state', () => {
    const live = withLive(server({ status: 'connecting' }), { status: 'connected', connection: { tools: 4, resources: false, attempts: 1 } })
    expect(live.status).toBe('connected')
    expect(live.connected).toBe(true)
    expect(live.connection?.tools).toBe(4)
  })
})

describe('primaryAction', () => {
  it('offers only what this version of Rinari can do', () => {
    const oauth = server({ auth: { kind: 'oauth' } })
    expect(primaryAction('signin', all, oauth)).toBe('sign_in')
    expect(primaryAction('reauth', all, oauth)).toBe('sign_in')
    expect(primaryAction('error', all, server())).toBe('reconnect')
    expect(primaryAction('error', none, server())).toBe('test')
    expect(primaryAction('disabled', all, server())).toBe('enable')
    expect(primaryAction('connected', all, server())).toBeNull()
    expect(primaryAction('connecting', all, server())).toBeNull()
  })
})

describe('helpers', () => {
  it('draws initials when there is no logo', () => {
    expect(initials('Google Drive')).toBe('GD')
    expect(initials('GitHub')).toBe('GH')
    expect(initials('notion')).toBe('N')
    expect(initials('')).toBe('?')
  })

  it('turns hints into plain language keys', () => {
    const known = (key: string) => key === 'mcp.hint.check_url_or_network'
    expect(hintKey('check_url_or_network', true, known)).toBe('mcp.hint.check_url_or_network')
    expect(hintKey('oauth_required', true, known)).toBe('connectors.hint.oauth_required')
    expect(hintKey('oauth_required', false, known)).toBe('mcp.hint.oauth_required')
    expect(hintKey('something_new', true, known)).toBe('connectors.hint.unknown')
    expect(hintKey(null, true, known)).toBeNull()
  })

  it('matches saved servers with their catalog entry and names them', () => {
    const entry = { id: 'notion', name: 'Notion', servers: [{ name: 'notion', scope: 'global', enabled: true }, { name: 'notion-2', scope: 'global', enabled: true }] } as unknown as McpCatalogEntry
    const map = catalogByServer([entry])
    expect(map.get('global:notion')?.id).toBe('notion')
    expect(displayName(server(), entry)).toBe('Notion')
    expect(displayName(server({ name: 'notion-2' }), entry)).toBe('Notion · notion-2')
    expect(displayName(server({ name: 'mine' }), null)).toBe('mine')
  })

  it('puts what needs the owner first', () => {
    const sorted = sortConnectors([
      { name: 'b', state: 'connected' as const },
      { name: 'a', state: 'disabled' as const },
      { name: 'c', state: 'reauth' as const },
      { name: 'd', state: 'error' as const },
    ])
    expect(sorted.map((item) => item.name)).toEqual(['c', 'd', 'b', 'a'])
  })
})

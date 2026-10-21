// @vitest-environment jsdom
import { installMockPlatform } from '../../test/mockPlatform'
installMockPlatform()
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { engineApi, type McpServer } from '../../services/engine'
import { connectorCapabilities } from './connectorModel'
import { resetConnectorEvents } from './connectorStore'
import { useConnectors } from './useConnectors'

afterEach(() => { cleanup(); vi.restoreAllMocks(); resetConnectorEvents() })

const server = (name: string): McpServer => ({ name, transport: 'stdio', command: 'npx x', url: '', scope: 'global', enabled: true, connected: false, updated_at: null })

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

it('runs one more load when a reload is asked while another is in flight, and the caller waits for it', async () => {
  const first = deferred<{ servers: McpServer[] }>()
  const list = vi.spyOn(engineApi, 'mcpList')
    .mockImplementationOnce(() => first.promise)
    .mockResolvedValue({ servers: [server('fresh')] })
  const caps = connectorCapabilities({})
  const { result } = renderHook(() => useConnectors(caps))
  await waitFor(() => expect(list).toHaveBeenCalledTimes(1))

  // A Remove/Toggle ends and asks for the list while the first load is still out.
  let settled = false
  let again!: Promise<void>
  act(() => { again = result.current.reload().then(() => { settled = true }) })
  const twice = result.current.reload()
  await act(async () => { first.resolve({ servers: [server('stale')] }); await again; await twice })
  expect(settled).toBe(true)
  expect(list).toHaveBeenCalledTimes(2)
  expect(result.current.items.map((item) => item.server.name)).toEqual(['fresh'])
})

it('reloads with the capabilities that arrive during a load', async () => {
  const first = deferred<{ servers: McpServer[] }>()
  vi.spyOn(engineApi, 'mcpList').mockImplementationOnce(() => first.promise).mockResolvedValue({ servers: [server('a')] })
  const catalog = vi.spyOn(engineApi, 'mcpCatalogList').mockResolvedValue({ version: 1, entries: [] })
  const { rerender } = renderHook(({ caps }) => useConnectors(caps), { initialProps: { caps: connectorCapabilities({}) } })
  rerender({ caps: connectorCapabilities({ mcp_catalog_v1: true }) })
  await act(async () => { first.resolve({ servers: [] }) })
  await waitFor(() => expect(catalog).toHaveBeenCalledTimes(1))
})

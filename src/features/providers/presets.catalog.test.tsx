// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { createTestBridge } from '../../platform/testBridge'
import { setPlatformForTests } from '../../platform'
import { useProviderPresets } from './presets'

let restore: (() => void) | undefined
afterEach(() => { cleanup(); restore?.() })

it('uses remote products absent from the legacy presets, keeps unknown neutral and respects enabled', async () => {
  const bridge = createTestBridge()
  restore = setPlatformForTests(bridge)
  bridge.mockCommand('provider_catalog_get', () => ({ presets: [
    ...['opencode-zen', 'chatgpt', 'zai-coding', 'minimax-coding', 'kimi-coding', 'github-copilot', 'custom', 'future'].map(id => ({
      id, name: id, enabled: true, endpoint: '', provider_type: 'custom', auth_methods: ['none'], experimental: false,
    })),
    { id: 'groq', name: 'Groq', enabled: false, endpoint: '', provider_type: 'custom', auth_methods: ['none'] },
  ] }))
  const { result } = renderHook(useProviderPresets)
  await waitFor(() => expect(result.current.some(p => p.id === 'future')).toBe(true))
  expect(result.current.map(p => [p.id, p.brand])).toEqual([
    ['opencode-zen', 'opencode'], ['chatgpt', 'openai'], ['zai-coding', 'zai'], ['minimax-coding', 'minimax'],
    ['kimi-coding', 'kimi'], ['github-copilot', 'github-copilot'], ['custom', undefined], ['future', undefined],
  ])
})

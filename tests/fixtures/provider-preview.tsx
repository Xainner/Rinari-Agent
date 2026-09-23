import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createTestBridge } from '../../src/platform/testBridge'
import { setPlatformForTests } from '../../src/platform'
import ProvidersView from '../../src/features/providers/ProvidersView'
import { I18nProvider } from '../../src/i18n'
import type { ProviderSummary } from '../../src/services/engine'
import '../../src/styles/index.css'

const bridge = createTestBridge()
setPlatformForTests(bridge)
const provider = { id: 'fixture-go', alias: 'OpenCode Go', type: 'custom', endpoint: 'https://opencode.ai/zen/go/v1', auth_method: 'api-key', has_credential: true, active: true, status_connected: true } as ProviderSummary
bridge.mockCommand('provider_usage_get', () => ({ provider_id: provider.id, product_id: 'opencode-go', status: 'available', windows: ['rolling', 'weekly', 'monthly'].map((id, i) => ({ id, label: id, scope: 'account', used_percent: [0, 15, 63][i], remaining_percent: [100, 85, 37][i], resets_at: '2026-09-30T15:29:52Z', duration_seconds: id === 'rolling' ? 18000 : null })), balances: [], fetched_at: '2026-09-22T00:00:00Z', source: 'https://opencode.ai/zen/go/v1/usage', detail: '', retry_at: null }))
bridge.mockCommand('provider_catalog_get', () => ({ presets: [] }))
bridge.mockCommand('model_discover', () => ({ providers: { [provider.alias]: [] } }))
bridge.mockCommand('model_list', () => ({ models: [{ id: 'fixture-glm', alias: 'GLM-5.3-Flash', provider_model_id: 'glm-5.3-flash', active: true, capabilities: { max_context_tokens: 1000000, vision: true } }] }))
bridge.mockCommand('provider_diagnostics_get', () => ({ product_id: 'opencode-go', endpoint: provider.endpoint, auth_method: 'api-key', checked_at: '2026-09-22T00:00:00Z', models: [{ id: 'fixture-glm', model: 'glm-5.3-flash', transport: 'chat' }] }))
function Preview() {
  const [narrow, setNarrow] = useState(false)
  const [light, setLight] = useState(false)
  useEffect(() => { document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark') }, [light])
  return <I18nProvider lang="es"><main style={{ maxWidth: narrow ? 360 : 820, margin: '32px auto', padding: 16 }}>
    <p className="mb-4 text-xs text-[var(--text-muted)]">Datos sintéticos · revisión visual</p>
    <button className="mb-4 rounded-lg border p-2 text-sm" onClick={() => setNarrow(value => !value)}>Cambiar ancho</button>
    <button className="mb-4 ml-2 rounded-lg border p-2 text-sm" onClick={() => setLight(value => !value)}>Cambiar tema</button>
    <ProvidersView providers={[provider]} onChanged={() => {}} engineCapabilities={{ provider_catalog_v1: true, provider_usage_v1: true }} />
  </main></I18nProvider>
}
const root = createRoot(document.getElementById('root')!)
root.render(<Preview />)
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount())

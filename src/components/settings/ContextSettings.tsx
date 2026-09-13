import { useEffect, useState } from 'react'
import { engineApi, commandMessage, type ModelSummary, type ProviderSummary } from '../../services/engine'
import type { ContextSettings as Config } from '../../types/protocol.generated'
import { useI18n } from '../../i18n'

export default function ContextSettings({ models, providers }: { models: ModelSummary[]; providers: ProviderSummary[] }) {
  const { lang } = useI18n()
  const es = lang === 'es'
  const [config, setConfig] = useState<Config>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [windows, setWindows] = useState<Record<string, import('../../types/protocol.generated').ContextStatus>>({})
  useEffect(() => { void engineApi.contextSettingsGet().then(setConfig).catch(e => setError(commandMessage(e))) }, [])
  const change = (update: Partial<Config>) => { setSaved(false); setConfig(c => c && { ...c, ...update }) }
  const style = 'rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2'
  return <section className="max-w-2xl space-y-5 p-6">
    <h2 className="text-xl font-semibold">{es ? 'Contexto y compactación' : 'Context and compaction'}</h2>
    {error && <p role="alert">{error}</p>}
    {config && <>
      <label className="flex gap-3"><input type="checkbox" checked={config.enabled} onChange={e => change({ enabled: e.target.checked })} />{es ? 'Compactar automáticamente' : 'Compact automatically'}</label>
      <label className="flex items-center gap-3">{es ? 'Umbral (%)' : 'Threshold (%)'}<input className={style} type="number" min={1} max={100} value={config.compact_at_percent} onChange={e => change({ compact_at_percent: Number(e.target.value) })} /></label>
      <label className="block">{es ? 'Modelo para resumir' : 'Summarization model'}<select className={`${style} block w-full`} value={config.model_id ?? ''} onChange={e => change({ model_id: e.target.value || null })}>
        <option value="">{es ? 'Modelo de la conversación' : 'Conversation model'}</option>
        {providers.map(p => <optgroup key={p.id} label={p.alias}>{models.filter(m => m.provider_id === p.id && m.saved !== false).map(m => <option key={m.id} value={m.id}>{m.alias}</option>)}</optgroup>)}
      </select></label>
      <p className="text-sm text-[var(--text-muted)]">{es ? 'Automático usa los metadatos disponibles del modelo. Puedes indicar la ventana efectiva de tu proveedor o servidor en tokens.' : 'Automatic uses available model metadata. You can override the effective context window of your provider or server in tokens.'}</p>
      {models.filter(m => m.saved !== false).map(m => <label key={m.id} className="flex items-center justify-between gap-3"><span>{m.alias}</span><input aria-label={`${es ? 'Contexto' : 'Context'}: ${m.alias}`} className={style} type="number" min={1} placeholder={es ? 'Automático' : 'Automatic'} value={config.model_windows[m.id] ?? ''} onChange={e => {
        const windows = { ...config.model_windows }
        if (e.target.value === '') delete windows[m.id]; else windows[m.id] = Number(e.target.value)
        change({ model_windows: windows })
      }} /></label>)}
      {models.filter(m => m.saved !== false).map(m => <div key={`status-${m.id}`} className="text-sm"><button className="underline" onClick={() => { void engineApi.contextStatus(m.id).then(value => setWindows(w => ({ ...w, [m.id]: value }))).catch(e => setError(commandMessage(e))) }}>{es ? 'Consultar ventana efectiva' : 'Check effective window'}: {m.alias}</button>{windows[m.id] && <p>{windows[m.id].window_tokens.toLocaleString()} tokens · {windows[m.id].window_source === 'manual' ? 'Manual' : windows[m.id].window_estimated ? (es ? 'Estimación de respaldo' : 'Fallback estimate') : (es ? 'Metadatos del modelo' : 'Model metadata')}</p>}</div>)}
      <button className={style} disabled={busy} onClick={async () => { setBusy(true); setError(''); try { setConfig(await engineApi.contextSettingsSet(config)); setWindows({}); setSaved(true) } catch (e) { setError(commandMessage(e)) } finally { setBusy(false) } }}>{es ? 'Guardar' : 'Save'}</button>
      {saved && <p role="status">{es ? 'Configuración guardada' : 'Settings saved'}</p>}
    </>}
  </section>
}

import { useEffect, useState } from 'react'
import { engineApi, commandMessage, type ModelSummary, type ProviderSummary } from '../../services/engine'
import type { VisionSettings as Config } from '../../types/protocol.generated'
import { useI18n } from '../../i18n'

export default function VisionSettings({ models, providers }: { models: ModelSummary[]; providers: ProviderSummary[] }) {
  const { lang } = useI18n()
  const es = lang === 'es'
  const [config, setConfig] = useState<Config>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  useEffect(() => { void engineApi.visionSettingsGet().then(setConfig).catch(e => setError(commandMessage(e))) }, [])
  const change = (value: Partial<Config>) => { setConfig(c => c ? { ...c, ...value } : c); setSaved(false) }
  const selectStyle = 'block w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3'
  return <section className="max-w-2xl space-y-5 p-6">
    <h2 className="text-xl font-semibold">{es ? 'Visión e imágenes' : 'Vision and images'}</h2>
    <p className="text-sm text-[var(--text-muted)]">{es ? 'Los adjuntos y la herramienta de imágenes usan esta misma configuración. El modelo dedicado recibe las imágenes; la conversación recibe su análisis. Los originales permanecen disponibles para nuevas consultas.' : 'Attachments and the image tool share this configuration. The dedicated model receives images; the conversation receives its analysis. Originals remain available for follow-up questions.'}</p>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    {config && <>
      <label className="block space-y-2"><span>{es ? 'Cómo analizar las imágenes' : 'Image analysis mode'}</span>
        <select className={selectStyle} value={config.mode} onChange={e => change({ mode: e.target.value as Config['mode'] })}>
          <option value="automatic">{es ? 'Automático' : 'Automatic'}</option>
          <option value="dedicated">{es ? 'Auxiliar' : 'Auxiliary'}</option>
          <option value="conversation">{es ? 'Nativo' : 'Native'}</option>
        </select>
      </label>
      <p className="text-xs text-[var(--text-muted)]">{es ? 'Automático prioriza el auxiliar configurado. Sin auxiliar usa visión nativa cuando el modelo declara compatibilidad. Puedes declarar la capacidad del modelo o elegir Nativo.' : 'Automatic prioritizes the configured auxiliary model. Otherwise it uses declared native vision. Declare model support below or select Native.'}</p>
      {config.mode !== 'conversation' && <>
        <label className="block space-y-2"><span>{es ? 'Modelo visual' : 'Visual model'}</span>
          <select className={selectStyle} value={config.model_id ?? ''} onChange={e => change({ model_id: e.target.value || null })}>
            <option value="">{es ? 'Sin modelo dedicado' : 'No dedicated model'}</option>
            {providers.map(provider => <optgroup key={provider.id} label={provider.alias}>
              {models.filter(m => m.provider_id === provider.id && m.saved !== false).map(m => <option key={m.id} value={m.id} disabled={(config.model_overrides?.[m.id] ?? m.capabilities?.vision) === false}>{m.alias}</option>)}
            </optgroup>)}
          </select>
        </label>
      </>}
      <fieldset className="space-y-2"><legend>{es ? 'Capacidad visual por modelo' : 'Vision capability per model'}</legend>
        {models.filter(m => m.saved !== false).map(model => <label key={model.id} className="flex items-center justify-between gap-3"><span>{model.alias}</span>
          <select aria-label={`${es ? 'Visión' : 'Vision'}: ${model.alias}`} className={selectStyle} value={config.model_overrides?.[model.id] === undefined ? 'auto' : String(config.model_overrides[model.id])} onChange={event => {
            const next = { ...config.model_overrides }
            if (event.target.value === 'auto') delete next[model.id]
            else next[model.id] = event.target.value === 'true'
            change({ model_overrides: next })
          }}><option value="auto">{es ? 'Automática' : 'Automatic'}</option><option value="true">{es ? 'Compatible' : 'Supported'}</option><option value="false">{es ? 'No compatible' : 'Unsupported'}</option></select>
        </label>)}
      </fieldset>
      {config.execution && <fieldset className="space-y-3"><legend>{es ? 'Ejecución de modelos (todas las rutas)' : 'Model execution (all routes)'}</legend>
        <p className="text-xs text-[var(--text-muted)]">{es ? 'Política de esta instalación, compartida por sesiones y agentes. No representa los slots del servidor. Vacío hereda la configuración general o del adaptador.' : 'Installation policy shared by sessions and agents, not server slots. Empty inherits general or adapter settings.'}</p>
        <label className="block">{es ? 'Concurrencia general por destino' : 'Default concurrency per destination'}<input className={selectStyle} type="number" min="1" value={config.execution.max_concurrency} onChange={e => change({ execution: { ...config.execution!, max_concurrency: Number(e.target.value) } })} /></label>
        <details className="space-y-2"><summary>{es ? 'Tiempos de espera del modelo (segundos)' : 'Model timeouts (seconds)'}</summary>
          {(['connect', 'first_byte', 'idle', 'total'] as const).map(key => <label key={key} className="block">{({connect: es ? 'Conexión' : 'Connection', first_byte: es ? 'Primer dato' : 'First byte', idle: es ? 'Inactividad' : 'Inactivity', total: es ? 'Duración total' : 'Total duration'})[key]}
            <input type="number" min="1" className={selectStyle} placeholder={String(({connect:15,first_byte:120,idle:120,total:900})[key])} value={config.execution!.timeouts?.[key] ?? ''} onChange={e => {
              const next = {...config.execution!.timeouts}; if (!e.target.value) delete next[key]; else next[key] = Number(e.target.value)
              change({execution: {...config.execution!, timeouts: next}})
            }} /></label>)}
          {providers.map(provider => <fieldset key={provider.id}><legend>{provider.alias}</legend>{(['connect','first_byte','idle','total'] as const).map(key => <label key={key} className="block">{({connect: es ? "Conexión" : "Connection", first_byte: es ? "Primer dato" : "First byte", idle: es ? "Inactividad" : "Inactivity", total: es ? "Duración total" : "Total duration"})[key]}
            <input type="number" min="1" className={selectStyle} placeholder={es ? 'Heredar' : 'Inherit'} value={config.execution!.provider_timeouts?.[provider.id]?.[key] as number ?? ''} onChange={e => {
              const next = {...config.execution!.provider_timeouts?.[provider.id] as Record<string, number>}; if (!e.target.value) delete next[key]; else next[key] = Number(e.target.value)
              change({execution: {...config.execution!, provider_timeouts: {...config.execution!.provider_timeouts, [provider.id]: next}}})
            }} /></label>)}</fieldset>)}
        </details>
        {providers.map(provider => <label key={provider.id} className="block">{es ? 'Concurrencia' : 'Concurrency'}: {provider.alias}
          <input className={selectStyle} type="number" min="1" placeholder={`${es ? 'Heredar' : 'Inherit'} (${config.execution!.max_concurrency})`} value={config.execution!.providers[provider.id] ?? ''} onChange={e => {
            const next = { ...config.execution!.providers }; if (e.target.value === '') delete next[provider.id]; else next[provider.id] = Number(e.target.value)
            change({ execution: { ...config.execution!, providers: next } })
          }} /></label>)}
        {models.filter(m => m.saved !== false).map(model => <label key={model.id} className="block">{es ? 'Máximo de tokens de salida' : 'Output token maximum'}: {model.alias}
          <input className={selectStyle} type="number" min="1" placeholder={es ? 'Heredar modelo/adaptador' : 'Inherit model/adapter'} value={config.execution!.models[model.id] ?? ''} onChange={e => {
            const next = { ...config.execution!.models }; if (e.target.value === '') delete next[model.id]; else next[model.id] = Number(e.target.value)
            change({ execution: { ...config.execution!, models: next } })
          }} /></label>)}
      </fieldset>}
      <button type="button" disabled={busy} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-white disabled:opacity-50" onClick={async () => {
        setBusy(true); setError('')
        try { setConfig(await engineApi.visionSettingsSet(config)); setSaved(true); window.dispatchEvent(new Event('rinari-vision-changed')) }
        catch (e) { setError(commandMessage(e)) }
        finally { setBusy(false) }
      }}>{busy ? (es ? 'Guardando…' : 'Saving…') : (es ? 'Guardar' : 'Save')}</button>
      {saved && <p role="status" className="text-sm">{es ? 'Configuración guardada.' : 'Settings saved.'}</p>}
    </>}
  </section>
}

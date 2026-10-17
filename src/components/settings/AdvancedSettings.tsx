import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  Activity, ChevronDown, Cpu, Download, Eraser, FolderOpen, Gauge, Globe, HardDrive, LoaderCircle, Lock, PackageOpen, RotateCcw,
  Search, ShieldAlert, Sparkles, Stethoscope, Workflow,
} from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import type { I18nKey } from '../../i18n/es'
import { useUIStore } from '../../stores/ui'
import { Switch } from '../ui/switch'
import { useConfirm } from '../ui/useConfirm'
import { platform, type HostSettings, type HostSettingsPatch, type StartupLimit } from '../../platform'
import type { StableReturnPreview } from '../../../electron/shared/contracts'
import type { EngineStatus } from '../../platform/engineStatus'
import {
  commandMessage, engineApi, type AdvancedSetting, type ExecutionSettingsResult,
  type ModelSummary, type ProviderSummary, type StorageUsage, type TimeoutKey,
} from '../../services/engine'
import type { NetworkSettings, NetworkTest } from '../../types/protocol.generated'
import OrphanProcesses from '../../features/processes/OrphanProcesses'
import { useReviewExport } from '../../features/review/ReviewExportDialog'
import { IS_NIGHTLY } from '../../lib/channel'
import { inputClass } from './parts'
import { useCalmMotion } from '../../lib/motion'
import { useDiagnosticsExport } from './diagnosticsExport'
import { checkForUpdates } from '../../services/updates'

const TIMEOUT_KEYS: readonly TimeoutKey[] = ['connect', 'first_byte', 'idle', 'total']
type Preset = 'normal' | 'slow' | 'unstable' | 'custom'
/** Los predefinidos de «Conexiones con los modelos» (plan 0.4.0 #96). */
const PRESETS: Record<Exclude<Preset, 'custom'>, Record<TimeoutKey, number>> = {
  normal: { connect: 15, first_byte: 120, idle: 120, total: 900 },
  slow: { connect: 30, first_byte: 600, idle: 300, total: 3600 },
  unstable: { connect: 30, first_byte: 180, idle: 180, total: 1200 },
}
const NEW_DESTINATIONS = 'permissions.ask_new_destinations'
/** Los límites se agrupan por para qué sirven. */
const LIMIT_GROUPS: { id: string; keys: string[] }[] = [
  { id: 'emergency', keys: ['runtime.emergency.max_runtime_minutes', 'runtime.emergency.max_model_calls', 'runtime.emergency.max_tool_calls', 'runtime.emergency.max_subagent_calls', 'runtime.cost.max_turn_cost'] },
  { id: 'tools', keys: ['runtime.safeguards.loop_detection', 'runtime.tools.max_concurrency', 'runtime.tools.observation_bytes', 'runtime.tools.round_observation_bytes', 'context.artifact_output_threshold_kb'] },
  { id: 'agents', keys: ['agents.enabled', 'agents.max_concurrent', 'agents.max_depth', 'agents.max_total'] },
]
/** Se muestran en KiB; el Engine los guarda en bytes. */
const KIB = new Set(['runtime.tools.observation_bytes', 'runtime.tools.round_observation_bytes'])

const limitLabel = (key: string) => `adv.limit.${key.replace(/\./g, '_')}` as I18nKey
const limitHint = (key: string) => `adv.limitHint.${key.replace(/\./g, '_')}` as I18nKey

function presetOf(timeouts: Partial<Record<TimeoutKey, number>> | undefined): Preset {
  const values = timeouts ?? {}
  if (TIMEOUT_KEYS.every((key) => values[key] === undefined)) return 'normal'
  for (const name of ['normal', 'slow', 'unstable'] as const) {
    if (TIMEOUT_KEYS.every((key) => (values[key] ?? PRESETS.normal[key]) === PRESETS[name][key])) return name
  }
  return 'custom'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1 }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`
}

/**
 * Ajustes → Avanzado (plan 0.4.0 #96): lo global y el diagnóstico, en
 * tarjetas plegables con su resumen y una búsqueda arriba. El máximo de
 * salida vive en cada modelo y los tiempos de un proveedor en el proveedor.
 */
export default function AdvancedSettings({ providers = [], activeSessionId = null }: { models?: ModelSummary[]; providers?: ProviderSummary[]; activeSessionId?: string | null }) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [execution, setExecution] = useState<ExecutionSettingsResult | null>(null)
  const [limits, setLimits] = useState<AdvancedSetting[] | null>(null)
  const [network, setNetwork] = useState<NetworkSettings | null>(null)
  const [status, setStatus] = useState<EngineStatus | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const [exec, adv, net] = await Promise.all([
        engineApi.executionSettingsGet(),
        engineApi.advancedSettingsGet(),
        engineApi.networkSettingsGet(),
      ])
      setExecution(exec)
      setLimits(adv.limits)
      setNetwork(net)
    } catch (e) {
      setError(commandMessage(e))
    }
    void platform().engine.status().then(setStatus).catch(() => setStatus(null))
  }, [])
  useEffect(() => { void load() }, [load])

  const changed = useMemo(() => {
    let n = (limits ?? []).filter((row) => row.key !== NEW_DESTINATIONS && row.value !== row.default).length
    if (execution && (presetOf(execution.settings.timeouts) !== 'normal' || execution.settings.max_concurrency !== execution.defaults.max_concurrency)) n += 1
    if (network && ((network.proxy as { mode?: string }).mode !== 'system' || (network.certificates as { mode?: string }).mode !== 'system')) n += 1
    return n
  }, [limits, execution, network])

  const needle = query.trim().toLowerCase()
  const matches = (words: string) => needle === '' || words.toLowerCase().includes(needle)
  const card = (id: string, words: string) => ({
    id,
    hidden: !matches(words),
    open: needle !== '' ? matches(words) : Boolean(open[id]),
    onToggle: () => setOpen((current) => ({ ...current, [id]: !current[id] })),
  })

  if (error) {
    return (
      <section className="space-y-4">
        <AdvancedHeader />
        <div role="alert" className="settings-card text-sm">
          <p className="text-[var(--danger)]">{error}</p>
          <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => void load()}>{t('adv.retry')}</button>
        </div>
      </section>
    )
  }
  if (!execution || !limits || !network) {
    return (
      <section className="space-y-4" aria-busy="true">
        <AdvancedHeader />
        {[0, 1, 2].map((i) => <div key={i} className="settings-card h-16 motion-safe:animate-pulse" />)}
      </section>
    )
  }

  const words = (...keys: I18nKey[]) => keys.map((key) => t(key)).join(' ')
  return (
    <section aria-labelledby="advanced-heading" className="adv-page space-y-4" data-testid="advanced-settings">
      <AdvancedHeader />
      <label className="adv-search">
        <Search size={14} aria-hidden="true" />
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('adv.search')} aria-label={t('adv.search')} />
      </label>
      <StatusCard status={status} changed={changed} />
      <div className="adv-grid">
        <ConnectionsCard {...card('connections', words('adv.connections.title', 'adv.connections.desc') + ' timeout tiempo espera concurrency')} execution={execution} providers={providers} onSaved={setExecution} />
        <LimitsCard {...card('limits', words('adv.limits.title', 'adv.limits.desc') + ' bucle loop subagentes coste cost')} limits={limits} onSaved={setLimits} />
        <NetworkCard {...card('network', words('adv.network.title', 'adv.network.desc') + ' proxy certificados certificates tls')} network={network} onSaved={setNetwork} />
        <DiagnosticsCard {...card('diagnostics', words('adv.diagnostics.title', 'adv.diagnostics.desc', 'adv.diagnostics.detailed', 'review.title') + ' registros logs')} activeSessionId={activeSessionId} />
        <StorageCard {...card('storage', words('adv.storage.title', 'adv.storage.desc', 'adv.storage.clean') + ' espacio disco disk')} />
        <ProcessesCard {...card('processes', words('adv.processes.title', 'adv.processes.desc') + ' huérfanos orphans')} />
        <EngineCard {...card('engine', words('adv.engine.title', 'adv.engine.desc', 'adv.engine.startupLimit', 'adv.engine.hardware', 'adv.engine.environment') + ' motor reiniciar restart rinari.md gpu')} status={status} />
        <UpdatesCard {...card('updates', words('adv.updates.title', 'adv.updates.desc', 'adv.updates.channel') + ' nightly update')} />
        <ResetCard {...card('reset', words('adv.reset.title', 'adv.reset.desc'))} execution={execution} limits={limits} onDone={() => void load()} />
      </div>
    </section>
  )
}

function AdvancedHeader() {
  const { t } = useI18n()
  return (
    <div>
      <h2 id="advanced-heading" className="font-display text-lg font-bold text-[var(--text)]">{t('settings.nav.advanced')}</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{t('settings.advanced.description')}</p>
    </div>
  )
}

interface CardProps { id: string; hidden: boolean; open: boolean; onToggle: () => void }

function AdvCard({ id, hidden, open, onToggle, icon, title, desc, summary, children }: CardProps & { icon: ReactNode; title: string; desc: string; summary: ReactNode; children: ReactNode }) {
  const calm = useCalmMotion()
  if (hidden) return null
  // Las tarjetas se recolocan con animación de diseño (`layout`) al abrir una o
  // filtrar: la abierta ocupa las dos columnas y las demás se deslizan a su
  // sitio en vez de saltar. Con movimiento reducido, el mismo orden sin animar.
  return (
    <motion.section layout={calm ? false : 'position'} transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }} className="adv-card settings-card" data-card={id} data-open={open || undefined}>
      <button type="button" className="adv-card-head" aria-expanded={open} aria-controls={`adv-${id}`} onClick={onToggle}>
        <span className="adv-card-icon" aria-hidden="true">{icon}</span>
        <span className="min-w-0 flex-1 text-left">
          <span className="adv-card-title">{title}</span>
          <span className="adv-card-summary">{open ? desc : summary}</span>
        </span>
        <ChevronDown size={15} aria-hidden="true" className="adv-card-chevron" />
      </button>
      {open && <div id={`adv-${id}`} className="adv-card-body">{children}</div>}
    </motion.section>
  )
}

function StatusCard({ status, changed }: { status: EngineStatus | null; changed: number }) {
  const { t } = useI18n()
  const ready = status?.state === 'ready'
  return (
    <div className="adv-status" data-testid="advanced-status">
      <div className="adv-status-engine" data-ready={ready || undefined}>
        <span className="adv-status-dot" aria-hidden="true" />
        <span>{ready ? t('adv.status.ready') : t('adv.status.notReady')}</span>
      </div>
      <dl className="adv-status-facts">
        <div><dt>{t('adv.status.engine')}</dt><dd>{status?.engine_version ?? '—'}</dd></div>
        <div><dt>{t('adv.status.protocol')}</dt><dd>{status?.protocol_version ?? '—'}</dd></div>
        <div><dt>{t('adv.status.channel')}</dt><dd>{IS_NIGHTLY ? 'Nightly' : t('adv.status.stable')}</dd></div>
      </dl>
      {changed > 0 && <span className="r-chip" data-tone="accent" data-testid="advanced-changed">{t(changed === 1 ? 'adv.status.changedOne' : 'adv.status.changed', { n: changed })}</span>}
    </div>
  )
}

function ConnectionsCard({ execution, providers, onSaved, ...card }: CardProps & { execution: ExecutionSettingsResult; providers: ProviderSummary[]; onSaved: (value: ExecutionSettingsResult) => void }) {
  const { t } = useI18n()
  const settings = execution.settings
  const preset = presetOf(settings.timeouts)
  const [custom, setCustom] = useState(preset === 'custom')
  const [draft, setDraft] = useState<Record<TimeoutKey, string>>(() => Object.fromEntries(TIMEOUT_KEYS.map((key) => [key, String(settings.timeouts?.[key] ?? execution.defaults.timeouts[key])])) as Record<TimeoutKey, string>)
  const [concurrency, setConcurrency] = useState(String(settings.max_concurrency))
  const [invalid, setInvalid] = useState<string | null>(null)
  const own = new Set([...Object.keys(settings.providers ?? {}), ...Object.keys(settings.provider_timeouts ?? {})])
  const ownNames = providers.filter((provider) => own.has(provider.id) || own.has(provider.alias)).map((provider) => provider.alias)
  const save = async (patch: Partial<ExecutionSettingsResult['settings']>) => {
    try {
      onSaved(await engineApi.executionSettingsSet({ ...settings, ...patch }))
      toast.success(t('adv.saved'))
    } catch (e) {
      toast.error(commandMessage(e))
    }
  }
  const pick = (name: Preset) => {
    if (name === 'custom') { setCustom(true); return }
    setCustom(false)
    setDraft(Object.fromEntries(TIMEOUT_KEYS.map((key) => [key, String(PRESETS[name][key])])) as Record<TimeoutKey, string>)
    void save({ timeouts: name === 'normal' ? {} : { ...PRESETS[name] } })
  }
  const saveCustom = () => {
    const values: Partial<Record<TimeoutKey, number>> = {}
    for (const key of TIMEOUT_KEYS) {
      const value = Number(draft[key])
      if (!Number.isFinite(value) || value <= 0) { setInvalid(key); return }
      values[key] = value
    }
    setInvalid(null)
    void save({ timeouts: values })
  }
  const saveConcurrency = () => {
    const value = Number(concurrency)
    if (!Number.isInteger(value) || value < 1 || value > 64) { setInvalid('concurrency'); return }
    setInvalid(null)
    if (value !== settings.max_concurrency) void save({ max_concurrency: value })
  }
  const active: Preset = custom ? 'custom' : preset
  return (
    <AdvCard {...card} icon={<Gauge size={16} />} title={t('adv.connections.title')} desc={t('adv.connections.desc')}
      summary={t('adv.connections.summary', { preset: t(`adv.preset.${active}` as I18nKey), n: settings.max_concurrency })}>
      <div role="tablist" aria-label={t('adv.connections.presets')} className="seg-tabs w-fit">
        {(['normal', 'slow', 'unstable', 'custom'] as const).map((name) => (
          <button key={name} type="button" role="tab" aria-selected={active === name} className="seg-tab" onClick={() => pick(name)}>
            {active === name && <span className="seg-tab-pill" aria-hidden="true" />}
            <span className="relative">{t(`adv.preset.${name}` as I18nKey)}</span>
          </button>
        ))}
      </div>
      <p className="adv-hint">{t(`adv.presetHint.${active}` as I18nKey)}</p>
      {active === 'custom' && (
        <div className="adv-fields">
          {TIMEOUT_KEYS.map((key) => (
            <label key={key} className="adv-field" data-invalid={invalid === key || undefined}>
              <span>{t(`adv.timeout.${key}` as I18nKey)}</span>
              <input type="number" min={1} className={inputClass} value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} onBlur={saveCustom} onKeyDown={(event) => { if (event.key === 'Enter') saveCustom() }} />
              <small>{t(`adv.timeoutHint.${key}` as I18nKey, { n: execution.defaults.timeouts[key] })}</small>
            </label>
          ))}
        </div>
      )}
      <label className="adv-field" data-invalid={invalid === 'concurrency' || undefined}>
        <span>{t('adv.connections.concurrency')}</span>
        <input type="number" min={1} max={64} className={inputClass} value={concurrency} onChange={(event) => setConcurrency(event.target.value)} onBlur={saveConcurrency} onKeyDown={(event) => { if (event.key === 'Enter') saveConcurrency() }} />
        <small>{invalid === 'concurrency' ? t('adv.range', { min: 1, max: 64 }) : t('adv.connections.concurrencyHint', { n: execution.defaults.max_concurrency })}</small>
      </label>
      {ownNames.length > 0 && <p className="adv-note">{t('adv.connections.own', { n: ownNames.length, names: ownNames.join(', ') })}</p>}
    </AdvCard>
  )
}

function LimitsCard({ limits, onSaved, ...card }: CardProps & { limits: AdvancedSetting[]; onSaved: (rows: AdvancedSetting[]) => void }) {
  const { t } = useI18n()
  const byKey = new Map(limits.map((row) => [row.key, row]))
  const cost = byKey.get('runtime.cost.max_turn_cost')
  const loop = byKey.get('runtime.safeguards.loop_detection')
  const save = async (key: string, value: number | boolean | null) => {
    try {
      onSaved((await engineApi.advancedSettingsSet({ [key]: value })).limits)
      toast.success(t('adv.saved'))
    } catch (e) {
      toast.error(commandMessage(e))
    }
  }
  const summary = [
    cost && Number(cost.value) > 0 ? t('adv.limits.costCap', { n: String(cost.value) }) : t('adv.limits.noCost'),
    loop?.value ? t('adv.limits.loopOn') : t('adv.limits.loopOff'),
  ].join(' · ')
  return (
    <AdvCard {...card} icon={<ShieldAlert size={16} />} title={t('adv.limits.title')} desc={t('adv.limits.desc')} summary={summary}>
      {LIMIT_GROUPS.map((group) => (
        <div key={group.id} className="adv-group">
          <p className="adv-group-title">{t(`adv.limits.group.${group.id}` as I18nKey)}</p>
          {group.keys.map((key) => byKey.get(key)).filter((row): row is AdvancedSetting => Boolean(row)).map((row) => (
            <LimitRow key={row.key} row={row} onSave={(value) => void save(row.key, value)} />
          ))}
        </div>
      ))}
    </AdvCard>
  )
}

function LimitRow({ row, onSave }: { row: AdvancedSetting; onSave: (value: number | boolean | null) => void }) {
  const { t } = useI18n()
  const factor = KIB.has(row.key) ? 1024 : 1
  const shown = (value: number | boolean) => (typeof value === 'number' ? String(value / factor) : String(value))
  const [draft, setDraft] = useState(shown(row.value))
  const [invalid, setInvalid] = useState(false)
  useEffect(() => { setDraft(shown(row.value)) }, [row.value]) // eslint-disable-line react-hooks/exhaustive-deps
  const changed = row.value !== row.default
  const commit = () => {
    const value = Number(draft) * factor
    const integer = row.type === 'int'
    const ok = Number.isFinite(value) && (!integer || Number.isInteger(value))
      && (row.min === null || value >= row.min) && (row.max === null || value <= row.max)
    setInvalid(!ok)
    if (ok && value !== row.value) onSave(value)
  }
  return (
    <div className="adv-row" data-changed={changed || undefined} data-invalid={invalid || undefined} data-key={row.key}>
      <div className="min-w-0 flex-1">
        <p className="adv-row-title">{changed && <span className="adv-dot" aria-hidden="true" />}{t(limitLabel(row.key))}</p>
        <p className="adv-row-hint">{invalid ? t('adv.range', { min: row.min === null ? 0 : row.min / factor, max: row.max === null ? '∞' : row.max / factor }) : t(limitHint(row.key))}</p>
      </div>
      {row.type === 'bool'
        ? <Switch checked={Boolean(row.value)} onCheckedChange={(next) => onSave(next)} aria-label={t(limitLabel(row.key))} />
        : <input type="number" className={`${inputClass} adv-number`} value={draft} aria-label={t(limitLabel(row.key))} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') commit() }} />}
      {changed && (
        <button type="button" className="btn btn-quiet btn-icon btn-xs" title={t('adv.resetOne', { value: shown(row.default) })} aria-label={t('adv.resetOne', { value: shown(row.default) })} onClick={() => onSave(null)}>
          <RotateCcw size={12} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

function NetworkCard({ network, onSaved, ...card }: CardProps & { network: NetworkSettings; onSaved: (value: NetworkSettings) => void }) {
  const { t } = useI18n()
  const proxy = network.proxy as { mode: 'system' | 'manual' | 'none'; url: string | null; bypass: string[] }
  const certs = network.certificates as { mode: 'system' | 'certifi' | 'file'; path?: string | null }
  const [url, setUrl] = useState(proxy.url ?? '')
  const [bypass, setBypass] = useState((proxy.bypass ?? []).join(', '))
  const [path, setPath] = useState(certs.path ?? '')
  const [test, setTest] = useState<NetworkTest | null>(null)
  const [testing, setTesting] = useState(false)
  // Las últimas latencias de cada proveedor, para el mini gráfico de la fila.
  const [history, setHistory] = useState<Record<string, number[]>>({})
  const [round, setRound] = useState(0)
  const save = async (patch: { proxy?: unknown; certificates?: unknown }) => {
    try {
      onSaved(await engineApi.networkSettingsSet(patch))
      toast.success(t('adv.saved'))
    } catch (e) {
      toast.error(commandMessage(e))
    }
  }
  const saveProxy = (mode: typeof proxy.mode) => {
    if (mode === 'manual' && !url.trim()) { onSaved({ ...network, proxy: { ...proxy, mode } }); return }
    void save({ proxy: { mode, url: mode === 'manual' ? url.trim() : null, bypass: bypass.split(',').map((item) => item.trim()).filter(Boolean) } })
  }
  const saveCerts = (mode: typeof certs.mode) => {
    if (mode === 'file' && !path.trim()) { onSaved({ ...network, certificates: { ...certs, mode } }); return }
    void save({ certificates: { mode, path: mode === 'file' ? path.trim() : null } })
  }
  const runTest = async () => {
    setTesting(true)
    try {
      const result = await engineApi.networkTest()
      setTest(result)
      setRound((value) => value + 1)
      setHistory((current) => {
        const next = { ...current }
        for (const row of result.results) if (row.ok && typeof row.latency_ms === 'number') next[row.provider_id] = [...(current[row.provider_id] ?? []), row.latency_ms].slice(-8)
        return next
      })
    } catch (e) {
      toast.error(commandMessage(e))
    } finally {
      setTesting(false)
    }
  }
  const effective = network.effective
  const summary = `${t(`adv.network.proxy.${proxy.mode}` as I18nKey)} · ${t(`adv.network.certs.${certs.mode}` as I18nKey)}`
  return (
    <AdvCard {...card} icon={<Globe size={16} />} title={t('adv.network.title')} desc={t('adv.network.desc')} summary={summary}>
      <div className="adv-group">
        <p className="adv-group-title">{t('adv.network.proxy')}</p>
        <div role="tablist" aria-label={t('adv.network.proxy')} className="seg-tabs w-fit">
          {(['system', 'manual', 'none'] as const).map((mode) => (
            <button key={mode} type="button" role="tab" aria-selected={proxy.mode === mode} className="seg-tab" onClick={() => saveProxy(mode)}>
              {proxy.mode === mode && <span className="seg-tab-pill" aria-hidden="true" />}
              <span className="relative">{t(`adv.network.proxy.${mode}` as I18nKey)}</span>
            </button>
          ))}
        </div>
        {proxy.mode === 'manual' && (
          <div className="adv-fields">
            <label className="adv-field"><span>{t('adv.network.proxyUrl')}</span>
              <input className={inputClass} value={url} placeholder="http://proxy:8080" onChange={(event) => setUrl(event.target.value)} onBlur={() => saveProxy('manual')} onKeyDown={(event) => { if (event.key === 'Enter') saveProxy('manual') }} />
            </label>
            <label className="adv-field"><span>{t('adv.network.bypass')}</span>
              <input className={inputClass} value={bypass} placeholder="intranet.local, 10.0.0.5" onChange={(event) => setBypass(event.target.value)} onBlur={() => saveProxy('manual')} />
            </label>
          </div>
        )}
        <p className="adv-hint">{t(`adv.network.proxyHint.${proxy.mode}` as I18nKey)}</p>
      </div>
      <div className="adv-group">
        <p className="adv-group-title">{t('adv.network.certs')}</p>
        <div role="tablist" aria-label={t('adv.network.certs')} className="seg-tabs w-fit">
          {(['system', 'certifi', 'file'] as const).map((mode) => (
            <button key={mode} type="button" role="tab" aria-selected={certs.mode === mode} className="seg-tab" onClick={() => saveCerts(mode)}>
              {certs.mode === mode && <span className="seg-tab-pill" aria-hidden="true" />}
              <span className="relative">{t(`adv.network.certs.${mode}` as I18nKey)}</span>
            </button>
          ))}
        </div>
        {certs.mode === 'file' && (
          <label className="adv-field"><span>{t('adv.network.certFile')}</span>
            <input className={inputClass} value={path} placeholder="C:\\certs\\empresa.pem" onChange={(event) => setPath(event.target.value)} onBlur={() => saveCerts('file')} onKeyDown={(event) => { if (event.key === 'Enter') saveCerts('file') }} />
          </label>
        )}
        <p className="adv-hint">{t(`adv.network.certsHint.${certs.mode}` as I18nKey)}</p>
      </div>
      {effective?.error && <p role="alert" className="adv-note" data-tone="danger">{effective.error}</p>}
      <div className="adv-group">
        <div className="flex items-center justify-between gap-3">
          <p className="adv-group-title">{t('adv.network.test')}</p>
          <button type="button" className="btn btn-secondary btn-sm" disabled={testing} onClick={() => void runTest()}>
            {testing ? <LoaderCircle size={13} className="motion-safe:animate-spin" aria-hidden="true" /> : <Activity size={13} aria-hidden="true" />} {t('adv.network.testAction')}
          </button>
        </div>
        {test && (
          <ul className="adv-test" data-testid="network-test" key={round}>
            {test.results.length === 0 && <li className="adv-hint">{t('adv.network.noProviders')}</li>}
            {test.results.map((row, index) => {
              const past = history[row.provider_id] ?? []
              const top = Math.max(...past, 1)
              return (
                <li key={row.provider_id} data-ok={row.ok || undefined} style={{ '--i': index } as CSSProperties}>
                  <span className="adv-test-dot" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{row.alias}</span>
                  {past.length > 1 && (
                    <span className="adv-spark" aria-hidden="true" title={past.map((ms) => `${ms} ms`).join(' · ')}>
                      {past.map((ms, at) => <i key={at} style={{ height: `${Math.max(12, (ms / top) * 100)}%` }} />)}
                    </span>
                  )}
                  <span className="adv-test-detail">{row.ok ? `${row.latency_ms ?? '—'} ms` : t(`adv.network.fail.${row.error_kind ?? 'network'}` as I18nKey)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </AdvCard>
  )
}

/** Lo que main lee antes de la ventana: límite de arranque, aceleración, registros, entorno (#70, #91, #96). */
function useHostSettings(open: boolean) {
  const [host, setHost] = useState<HostSettings | null>(null)
  useEffect(() => {
    if (!open || host) return
    platform().app.hostSettings().then(setHost).catch(() => {})
  }, [open, host])
  const update = async (patch: HostSettingsPatch) => {
    try {
      setHost(await platform().app.setHostSettings(patch))
    } catch (e) {
      toast.error(commandMessage(e))
    }
  }
  return { host, update }
}

function DiagnosticsCard({ activeSessionId, ...card }: CardProps & { activeSessionId: string | null }) {
  const { t, lang } = useI18n()
  const technical = useUIStore((state) => state.showTechnicalActivityNames)
  const setTechnical = useUIStore((state) => state.setShowTechnicalActivityNames)
  const { host, update } = useHostSettings(card.open)
  // Lo que lleva el paquete se ve antes de guardarlo (se movió aquí desde Acerca de).
  const diagnostics = useDiagnosticsExport()
  const until = host?.detailedLogsUntil
    ? new Date(host.detailedLogsUntil).toLocaleString(lang === 'es' ? 'es' : 'en', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
    : null
  return (
    <AdvCard {...card} icon={<Stethoscope size={16} />} title={t('adv.diagnostics.title')} desc={t('adv.diagnostics.desc')} summary={host?.detailedLogs ? t('adv.diagnostics.detailedOn') : t('adv.diagnostics.normalLogs')}>
      <div className="adv-row">
        <div className="min-w-0 flex-1">
          <p className="adv-row-title">{t('settings.advanced.technicalActivity')}</p>
          <p className="adv-row-hint">{t('settings.advanced.technicalActivityHint')}</p>
        </div>
        <Switch checked={technical} onCheckedChange={setTechnical} aria-label={t('settings.advanced.technicalActivity')} />
      </div>
      <div className="adv-row adv-row-live" data-testid="detailed-logs" data-on={host?.detailedLogs || undefined}>
        <div className="min-w-0 flex-1">
          <p className="adv-row-title">{t('adv.diagnostics.detailed')}</p>
          <p className="adv-row-hint">
            {host?.detailedLogs && until ? `${t('adv.diagnostics.detailedUntil', { time: until })}. ${t('adv.diagnostics.detailedRestart')}` : t('adv.diagnostics.detailedHint')}
          </p>
        </div>
        <Switch checked={host?.detailedLogs ?? false} disabled={!host} onCheckedChange={(on) => void update({ detailedLogs: on })} aria-label={t('adv.diagnostics.detailed')} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void platform().app.openFolder('logs').catch((e) => toast.error(commandMessage(e)))}>
          <FolderOpen size={13} aria-hidden="true" /> {t('adv.diagnostics.openLogs')}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={diagnostics.exporting} onClick={() => void diagnostics.run()}>
          {diagnostics.exporting ? <LoaderCircle size={13} className="motion-safe:animate-spin" aria-hidden="true" /> : <Stethoscope size={13} aria-hidden="true" />} {t('settings.about.exportAction')}
        </button>
        {/* La conversación abierta, para que otro la revise (#79). */}
        <button type="button" className="btn btn-secondary btn-sm" data-testid="adv-review-export" disabled={!activeSessionId} title={activeSessionId ? undefined : t('adv.diagnostics.reviewNoSession')} onClick={() => activeSessionId && useReviewExport.getState().open(activeSessionId)}>
          <PackageOpen size={13} aria-hidden="true" /> {t('review.menu')}
        </button>
      </div>
      {diagnostics.dialog}
    </AdvCard>
  )
}

/** Desde cuánto se sugiere limpiar (#91): nada se borra solo. */
const SUGGEST_TOTAL = 5 * 1024 ** 3
const SUGGEST_RECLAIMABLE = 500 * 1024 ** 2

function StorageCard(card: CardProps) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const [usage, setUsage] = useState<StorageUsage | null>(null)
  const [failed, setFailed] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const [cleaning, setCleaning] = useState<string | null>(null)
  const load = useCallback(() => {
    setFailed(false)
    engineApi.storageUsage().then(setUsage).catch(() => setFailed(true))
  }, [])
  useEffect(() => { if (card.open && !usage) load() }, [card.open, usage, load])
  const sections = (usage?.sections ?? []).filter((row) => row.bytes > 0).sort((a, b) => b.bytes - a.bytes)
  const sectionName = (id: string) => t(`adv.storage.section.${id}` as I18nKey)
  const biggest = [...sections].filter((row) => row.cleanable && (row.reclaimable ?? 0) > 0).sort((a, b) => (b.reclaimable ?? 0) - (a.reclaimable ?? 0))[0]
  const suggest = usage && biggest && usage.total >= SUGGEST_TOTAL && (biggest.reclaimable ?? 0) >= SUGGEST_RECLAIMABLE ? biggest : null
  const clean = async (id: string, reclaimable: number) => {
    const size = formatBytes(reclaimable)
    const sure = await confirm.ask({
      title: t('adv.storage.cleanTitle', { section: sectionName(id).toLowerCase() }),
      body: t(`adv.storage.cleanBody.${id}` as I18nKey, { size }),
      confirmLabel: t('adv.storage.clean'),
      cancelLabel: t('common.cancel'),
    })
    if (!sure) return
    setCleaning(id)
    try {
      const done = await engineApi.storageClean(id)
      setUsage(done.usage)
      toast.success(done.kept > 0 ? t('adv.storage.cleanedKept', { size: formatBytes(done.freed), n: done.kept }) : t('adv.storage.cleaned', { size: formatBytes(done.freed) }))
    } catch (e) {
      toast.error(commandMessage(e))
    } finally {
      setCleaning(null)
    }
  }
  return (
    <AdvCard {...card} icon={<HardDrive size={16} />} title={t('adv.storage.title')} desc={t('adv.storage.desc')} summary={usage ? formatBytes(usage.total) : t('adv.storage.open')}>
      {failed && <p role="alert" className="adv-note" data-tone="danger">{t('adv.storage.failed')} <button type="button" className="btn btn-quiet btn-xs" onClick={load}>{t('adv.retry')}</button></p>}
      {!usage && !failed && <p className="adv-hint"><LoaderCircle size={12} className="inline motion-safe:animate-spin" aria-hidden="true" /> {t('adv.storage.measuring')}</p>}
      {usage && (
        <>
          <p className="adv-storage-total"><span>{formatBytes(usage.total)}</span> {t('adv.storage.inUse')}</p>
          {suggest && (
            <div className="adv-suggest" data-testid="storage-suggest">
              <Sparkles size={14} aria-hidden="true" />
              <p className="min-w-0 flex-1">{t('adv.storage.suggest', { total: formatBytes(usage.total), size: formatBytes(suggest.reclaimable ?? 0), section: sectionName(suggest.id).toLowerCase() })}</p>
              <button type="button" className="btn btn-secondary btn-xs" disabled={cleaning !== null} onClick={() => void clean(suggest.id, suggest.reclaimable ?? 0)}>
                <Eraser size={12} aria-hidden="true" /> {t('adv.storage.clean')}
              </button>
            </div>
          )}
          <div className="adv-storage-bar" aria-hidden="true" data-hovered={hovered ?? undefined}>
            {sections.map((row, index) => (
              <span
                key={row.id}
                data-section={row.id}
                data-active={hovered === row.id || undefined}
                style={{ flexGrow: Math.max(row.bytes, 1), '--i': index } as CSSProperties}
                title={`${sectionName(row.id)} · ${formatBytes(row.bytes)}`}
                onMouseEnter={() => setHovered(row.id)}
                onMouseLeave={() => setHovered(null)}
              />
            ))}
          </div>
          <ul className="adv-storage-list" data-testid="storage-usage" data-hovered={hovered ?? undefined}>
            {sections.map((row) => {
              const reclaimable = row.reclaimable ?? 0
              return (
                <li key={row.id} data-section={row.id} data-active={hovered === row.id || undefined} onMouseEnter={() => setHovered(row.id)} onMouseLeave={() => setHovered(null)}>
                  <span className="adv-storage-swatch" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    {sectionName(row.id)}
                    {row.cleanable && reclaimable > 0 && <span className="adv-storage-reclaim">{t('adv.storage.reclaimable', { size: formatBytes(reclaimable) })}</span>}
                  </span>
                  <span className="adv-storage-size">{formatBytes(row.bytes)}</span>
                  {row.cleanable && (
                    <button
                      type="button"
                      className="btn btn-quiet btn-xs adv-storage-clean"
                      data-testid={`storage-clean-${row.id}`}
                      disabled={reclaimable === 0 || cleaning !== null}
                      title={reclaimable === 0 ? t('adv.storage.nothingToClean') : undefined}
                      onClick={() => void clean(row.id, reclaimable)}
                    >
                      {cleaning === row.id ? <LoaderCircle size={12} className="motion-safe:animate-spin" aria-hidden="true" /> : <Eraser size={12} aria-hidden="true" />} {t('adv.storage.clean')}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void platform().app.openFolder('home').catch((e) => toast.error(commandMessage(e)))}>
              <FolderOpen size={13} aria-hidden="true" /> {t('adv.storage.openFolder')}
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={load}>{t('adv.storage.refresh')}</button>
          </div>
          <p className="adv-hint">{t('adv.storage.manualOnly')}</p>
        </>
      )}
      {confirm.dialog}
    </AdvCard>
  )
}

function ProcessesCard(card: CardProps) {
  const { t } = useI18n()
  return (
    <AdvCard {...card} icon={<Workflow size={16} />} title={t('adv.processes.title')} desc={t('adv.processes.desc')} summary={t('adv.processes.summary')}>
      <OrphanProcesses />
      <p className="adv-hint">{t('adv.processes.hint')}</p>
    </AdvCard>
  )
}

/**
 * El arranque como una barra (#70): un tramo por paso, de ancho proporcional a
 * lo que tardó, y debajo cada paso con el segundo en que llegó.
 */
function StartupTimeline({ timeline, seconds }: { timeline: HostSettings['startupTimeline']; seconds: (ms: number) => string }) {
  const { t } = useI18n()
  const [hovered, setHovered] = useState<string | null>(null)
  const total = timeline.at(-1)?.ms ?? 0
  return (
    <div className="adv-startup" data-testid="startup-timeline" data-hovered={hovered ?? undefined}>
      <p className="adv-row-title">{t('adv.engine.timeline')} <span className="adv-row-meta">{seconds(total)} s</span></p>
      <div className="adv-startup-bar" aria-hidden="true">
        {timeline.map((entry, index) => (
          <span
            key={entry.step}
            data-active={hovered === entry.step || undefined}
            style={{ flexGrow: Math.max(entry.ms - (index > 0 ? timeline[index - 1].ms : 0), 1), '--i': index } as CSSProperties}
            onMouseEnter={() => setHovered(entry.step)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
      </div>
      <ol className="adv-startup-steps">
        {timeline.map((entry, index) => (
          <li key={entry.step} data-active={hovered === entry.step || undefined} style={{ '--i': index } as CSSProperties} onMouseEnter={() => setHovered(entry.step)} onMouseLeave={() => setHovered(null)}>
            <i aria-hidden="true" />
            {t(`adv.engine.step.${entry.step}` as I18nKey)} <span>{seconds(entry.ms)} s</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

const STARTUP_LIMITS: StartupLimit[] = ['auto', 30, 60]

function EngineCard({ status, ...card }: CardProps & { status: EngineStatus | null }) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const [restarting, setRestarting] = useState(false)
  const { host, update } = useHostSettings(card.open)
  const restart = async () => {
    const sure = await confirm.ask({ title: t('adv.engine.restartTitle'), body: t('adv.engine.restartBody'), confirmLabel: t('adv.engine.restart'), cancelLabel: t('common.cancel') })
    if (!sure) return
    setRestarting(true)
    try {
      await platform().engine.restart()
      toast.success(t('adv.engine.restarted'))
    } catch (e) {
      toast.error(commandMessage(e))
    } finally {
      setRestarting(false)
    }
  }
  const openPlace = (place: 'home' | 'instructions') => void platform().app.openFolder(place).catch((e) => toast.error(commandMessage(e)))
  const seconds = (ms: number) => (ms / 1000).toFixed(1).replace(/\.0$/, '')
  const started = host?.lastStartupMs ? t('adv.engine.lastStartup', { s: seconds(host.lastStartupMs) }) : null
  const summary = [status?.engine_version ?? '—', started].filter(Boolean).join(' · ')
  return (
    <AdvCard {...card} icon={<Cpu size={16} />} title={t('adv.engine.title')} desc={t('adv.engine.desc')} summary={summary}>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary btn-sm" disabled={restarting} onClick={() => void restart()}>
          {restarting ? <LoaderCircle size={13} className="motion-safe:animate-spin" aria-hidden="true" /> : <RotateCcw size={13} aria-hidden="true" />} {t('adv.engine.restart')}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openPlace('home')}><FolderOpen size={13} aria-hidden="true" /> {t('adv.engine.openHome')}</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openPlace('instructions')}><FolderOpen size={13} aria-hidden="true" /> {t('adv.engine.openInstructions')}</button>
      </div>
      {host && (
        <>
          <div className="adv-row" data-testid="startup-limit">
            <div className="min-w-0 flex-1">
              <p className="adv-row-title">{t('adv.engine.startupLimit')}{started ? <span className="adv-row-meta"> · {started}</span> : null}</p>
              <p className="adv-row-hint">{t('adv.engine.startupLimitHint')}</p>
            </div>
            <div role="tablist" aria-label={t('adv.engine.startupLimit')} className="seg-tabs w-fit">
              {STARTUP_LIMITS.map((limit) => (
                <button
                  key={String(limit)}
                  type="button"
                  role="tab"
                  aria-selected={host.startupLimit === limit}
                  className="seg-tab"
                  data-active={host.startupLimit === limit || undefined}
                  onClick={() => void update({ startupLimit: limit })}
                >
                  {host.startupLimit === limit && <span className="seg-tab-pill" aria-hidden="true" />}
                  <span className="relative">{limit === 'auto' ? t('adv.engine.startupAuto', { s: host.startupLimit === 'auto' ? host.startupLimitS : 45 }) : t('adv.engine.startupSeconds', { s: limit })}</span>
                </button>
              ))}
            </div>
          </div>
          {host.startupTimeline.length > 1 && <StartupTimeline timeline={host.startupTimeline} seconds={seconds} />}
          <div className="adv-row" data-testid="hardware-acceleration" data-pending={host.restartRequired || undefined}>
            <div className="min-w-0 flex-1">
              <p className="adv-row-title">{t('adv.engine.hardware')}</p>
              <p className="adv-row-hint">{host.restartRequired ? t('adv.engine.restartNeeded') : t('adv.engine.hardwareHint')}</p>
            </div>
            {host.restartRequired && (
              <button type="button" className="btn btn-primary btn-xs" onClick={() => void platform().app.relaunch().catch((e) => toast.error(commandMessage(e)))}>
                <RotateCcw size={12} aria-hidden="true" /> {t('adv.engine.restartApp')}
              </button>
            )}
            <Switch checked={host.hardwareAcceleration} onCheckedChange={(on) => void update({ hardwareAcceleration: on })} aria-label={t('adv.engine.hardware')} />
          </div>
          <div data-testid="engine-environment">
            <p className="adv-row-title">{t('adv.engine.environment')} <Lock size={11} className="text-[var(--text-subtle)]" aria-hidden="true" /></p>
            <p className="adv-row-hint">{t('adv.engine.environmentHint')}</p>
            {host.environment.length === 0
              ? <p className="adv-hint">{t('adv.engine.environmentNone')}</p>
              : (
                <dl className="adv-env">
                  {host.environment.map((entry) => (
                    <div key={entry.name}>
                      <dt>{entry.name}</dt>
                      <dd>{entry.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
          </div>
        </>
      )}
      <p className="adv-hint">{t('adv.engine.hint')}</p>
      {confirm.dialog}
    </AdvCard>
  )
}

/** El canal Nightly se instala desde el código; la versión normal, desde GitHub. */
const RELEASES_URL = 'https://github.com/Xainner/Rinari-Agent/releases/latest'

function UpdatesCard(card: CardProps) {
  const { t, lang } = useI18n()
  const auto = useUIStore((state) => state.autoCheckUpdates)
  const setAuto = useUIStore((state) => state.setAutoCheckUpdates)
  const [checking, setChecking] = useState(false)
  const confirm = useConfirm()
  // Nightly → la copia de la base a la que se vuelve (#96).
  const [stableReturn, setStableReturn] = useState<StableReturnPreview | null>(null)
  const [returning, setReturning] = useState(false)
  useEffect(() => {
    if (!IS_NIGHTLY || !card.open) return
    platform().app.stableReturnPreview().then(setStableReturn).catch(() => setStableReturn(null))
  }, [card.open])
  const backToStable = async () => {
    const backup = stableReturn?.backup
    if (!backup) {
      void platform().opener.openUrl(RELEASES_URL).catch((e) => toast.error(commandMessage(e)))
      return
    }
    const date = new Date(backup.createdAt).toLocaleString(lang === 'es' ? 'es' : 'en', { dateStyle: 'medium', timeStyle: 'short' })
    const sure = await confirm.ask({
      title: t('adv.updates.backTitle'),
      body: `${t('adv.updates.backBody', { date })} ${stableReturn?.stableInstalled ? t('adv.updates.backOpensStable') : t('adv.updates.backOpensDownloads')}`,
      confirmLabel: t('adv.updates.backConfirm'),
      cancelLabel: t('common.cancel'),
    })
    if (!sure) return
    setReturning(true)
    try {
      await platform().app.stableReturnApply(backup.name)
    } catch (e) {
      toast.error(commandMessage(e))
      setReturning(false)
    }
  }
  const check = async () => {
    setChecking(true)
    try {
      const found = await checkForUpdates()
      if (found) toast(t('adv.updates.found', { v: found.version }))
      else toast.success(t('adv.updates.upToDate'))
    } catch (e) {
      toast.error(commandMessage(e))
    } finally {
      setChecking(false)
    }
  }
  const summary = IS_NIGHTLY ? 'Nightly' : auto ? t('adv.updates.summaryStable') : t('adv.updates.summaryManual')
  return (
    <AdvCard {...card} icon={<Download size={16} />} title={t('adv.updates.title')} desc={t('adv.updates.desc')} summary={summary}>
      <div className="adv-row">
        <div className="min-w-0 flex-1">
          <p className="adv-row-title">{t('adv.updates.channel')}</p>
          <p className="adv-row-hint">{IS_NIGHTLY ? t('adv.updates.nightlyHint') : t('adv.updates.autoHint')}</p>
        </div>
        <span className="adv-channel" data-nightly={IS_NIGHTLY || undefined} data-testid="update-channel">{IS_NIGHTLY ? 'Nightly' : t('adv.updates.stable')}</span>
      </div>
      {IS_NIGHTLY ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary btn-sm" data-testid="back-to-stable" disabled={returning} onClick={() => void backToStable()}>
            {returning ? <LoaderCircle size={13} className="motion-safe:animate-spin" aria-hidden="true" /> : <RotateCcw size={13} aria-hidden="true" />} {t('adv.updates.backToStable')}
          </button>
          {stableReturn && !stableReturn.backup && <p className="adv-row-hint w-full">{t('adv.updates.backNoCopy')}</p>}
        </div>
      ) : (
        <>
          <div className="adv-row">
            <div className="min-w-0 flex-1">
              <p className="adv-row-title">{t('adv.updates.auto')}</p>
            </div>
            <Switch checked={auto} onCheckedChange={setAuto} aria-label={t('adv.updates.auto')} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary btn-sm" disabled={checking} onClick={() => void check()}>
              {checking ? <LoaderCircle size={13} className="motion-safe:animate-spin" aria-hidden="true" /> : <Download size={13} aria-hidden="true" />} {t('adv.updates.check')}
            </button>
          </div>
        </>
      )}
      {confirm.dialog}
    </AdvCard>
  )
}

function ResetCard({ execution, limits, onDone, ...card }: CardProps & { execution: ExecutionSettingsResult; limits: AdvancedSetting[]; onDone: () => void }) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const resetPage = async () => {
    const sure = await confirm.ask({ title: t('adv.reset.pageTitle'), body: t('adv.reset.pageBody'), confirmLabel: t('adv.reset.page'), cancelLabel: t('common.cancel') })
    if (!sure) return
    try {
      const { providers, models, provider_timeouts: providerTimeouts } = execution.settings
      await engineApi.executionSettingsSet({ max_concurrency: execution.defaults.max_concurrency, providers, models, ...(providerTimeouts ? { provider_timeouts: providerTimeouts } : {}) })
      const values = Object.fromEntries(limits.filter((row) => row.key !== NEW_DESTINATIONS).map((row) => [row.key, null]))
      await engineApi.advancedSettingsSet(values)
      await engineApi.networkSettingsSet({ proxy: { mode: 'system', url: null, bypass: [] }, certificates: { mode: 'system', path: null } })
      toast.success(t('adv.reset.done'))
      onDone()
    } catch (e) {
      toast.error(commandMessage(e))
    }
  }
  const resetUi = async () => {
    const sure = await confirm.ask({ title: t('adv.reset.uiTitle'), body: t('adv.reset.uiBody'), confirmLabel: t('adv.reset.ui'), cancelLabel: t('common.cancel') })
    if (!sure) return
    try { window.localStorage.clear() } catch { /* nothing stored */ }
    window.location.reload()
  }
  return (
    <AdvCard {...card} icon={<RotateCcw size={16} />} title={t('adv.reset.title')} desc={t('adv.reset.desc')} summary={t('adv.reset.summary')}>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void resetPage()}>{t('adv.reset.page')}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void resetUi()}>{t('adv.reset.ui')}</button>
      </div>
      {confirm.dialog}
    </AdvCard>
  )
}

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import { useI18n, type I18nKey } from '../../i18n'
import { inputClass, labelClass } from '../../lib/ui'
import { engineApi, type ScheduleSpec, type ScheduledTaskInput, type ScheduledToolSpec } from '../../services/engine'
import ScheduleSpecField from '../schedules/ScheduleSpecField'
import { specProblem } from '../schedules/scheduleModel'

const ON_RESULT: ScheduledToolSpec['on_result'][] = ['notify', 'nothing', 'agent', 'deliver']

/** Un objeto JSON escrito a mano, o `null` si no lo es. */
function parseArguments(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text.trim() || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch {
    return null
  }
}

/** Las herramientas de un conector, leídas al elegirlo (sin arrancar nada). */
function useConnectorTools(server: string): string[] {
  const [tools, setTools] = useState<string[]>([])
  useEffect(() => {
    setTools([])
    if (!server) return
    let live = true
    engineApi.mcpToolsList(server)
      .then((result) => { if (live) setTools(result.server.tools.filter((tool) => tool.listed !== false).map((tool) => tool.name)) })
      .catch(() => {})
    return () => { live = false }
  }, [server])
  return tools
}

function ConnectorToolFields({ connectors, server, tool, onServer, onTool, idPrefix }: {
  connectors: string[]
  server: string
  tool: string
  onServer: (value: string) => void
  onTool: (value: string) => void
  idPrefix: string
}) {
  const { t } = useI18n()
  const tools = useConnectorTools(server)
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block">
        <span className={labelClass}>{t('agency.rules.connector')}</span>
        <select value={server} data-testid={`${idPrefix}-server`} onChange={(event) => { onServer(event.target.value); onTool('') }} className={inputClass}>
          <option value="">—</option>
          {connectors.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>{t('agency.rules.tool')}</span>
        {tools.length > 0 ? (
          <select value={tool} data-testid={`${idPrefix}-tool`} onChange={(event) => onTool(event.target.value)} className={inputClass}>
            <option value="">—</option>
            {tools.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        ) : (
          // Sin la lista (conector sin conectar): el nombre a mano, lo valida el Engine.
          <input value={tool} data-testid={`${idPrefix}-tool`} spellCheck={false} onChange={(event) => onTool(event.target.value)} className={`${inputClass} font-mono`} />
        )}
      </label>
    </div>
  )
}

interface RuleFormProps {
  agentId: string
  open: boolean
  onClose: () => void
  /** La regla queda como propuesta: se prueba y se activa como las del agente. */
  onAdd: (proposal: ScheduledTaskInput) => boolean
}

/**
 * «Nueva regla» (Agency): el dueño escribe una regla permanente sin esperar a
 * que el agente la proponga. No se crea aquí: queda en «Reglas» como una
 * propuesta más, con «Probar» y «Activar regla», y la valida el Engine.
 */
export default function RuleForm({ agentId, open, onClose, onAdd }: RuleFormProps) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<'agent' | 'tool'>('tool')
  const [schedule, setSchedule] = useState<ScheduleSpec>({ kind: 'interval', minutes: 60 })
  const [prompt, setPrompt] = useState('')
  const [watch, setWatch] = useState('')
  const [connectors, setConnectors] = useState<string[]>([])
  const [server, setServer] = useState('')
  const [tool, setTool] = useState('')
  const [args, setArgs] = useState('{}')
  const [onResult, setOnResult] = useState<ScheduledToolSpec['on_result']>('notify')
  const [deliverServer, setDeliverServer] = useState('')
  const [deliverTool, setDeliverTool] = useState('')
  const [deliverArgs, setDeliverArgs] = useState('{"text": "{result}"}')
  const [onlyIf, setOnlyIf] = useState('')
  const [maxPerDay, setMaxPerDay] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setName(''); setKind('tool'); setSchedule({ kind: 'interval', minutes: 60 }); setPrompt(''); setWatch('')
    setServer(''); setTool(''); setArgs('{}'); setOnResult('notify')
    setDeliverServer(''); setDeliverTool(''); setDeliverArgs('{"text": "{result}"}'); setOnlyIf(''); setMaxPerDay(''); setError('')
    let live = true
    engineApi.agencyAgent(agentId)
      .then((result) => { if (live) setConnectors(result.agent.connectors) })
      .catch(() => { if (live) setConnectors([]) })
    return () => { live = false }
  }, [open, agentId])

  const problem = (): string | null => {
    if (!name.trim()) return t('schedules.form.needName')
    const spec = specProblem(schedule, t)
    if (spec) return spec
    if (kind === 'agent') return prompt.trim() ? null : t('schedules.form.needPrompt')
    if (!server || !tool.trim()) return t('agency.rules.needTool')
    if (!parseArguments(args)) return t('agency.rules.badJson')
    if (onResult === 'deliver') {
      if (!deliverServer || !deliverTool.trim()) return t('agency.rules.needTool')
      if (!parseArguments(deliverArgs)) return t('agency.rules.badJson')
    }
    if (maxPerDay.trim() && !(Number.isInteger(Number(maxPerDay)) && Number(maxPerDay) > 0)) return t('agency.rules.badMaxPerDay')
    return null
  }

  const add = () => {
    const found = problem()
    if (found) {
      setError(found)
      return
    }
    const proposal: ScheduledTaskInput = {
      name: name.trim(),
      kind,
      schedule,
      prompt: kind === 'agent' ? prompt.trim() : '',
      agent_id: agentId,
      ...(watch.trim() ? { watch: { path: watch.trim() } } : {}),
      ...(kind === 'tool'
        ? {
            tool: {
              server,
              tool: tool.trim(),
              arguments: parseArguments(args) ?? {},
              on_result: onResult,
              ...(onResult === 'deliver' ? { deliver: { server: deliverServer, tool: deliverTool.trim(), arguments: parseArguments(deliverArgs) ?? {} } } : {}),
              ...(onlyIf.trim() ? { only_if_contains: onlyIf.trim() } : {}),
              ...(maxPerDay.trim() ? { max_per_day: Number(maxPerDay) } : {}),
            },
          }
        : {}),
    }
    if (!onAdd(proposal)) {
      setError(t('agency.rules.alreadyWaiting'))
      return
    }
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose() }}>
      <DialogContent className="max-w-xl" data-testid="agency-rule-form">
        <DialogTitle>{t('agency.rules.new')}</DialogTitle>
        <DialogDescription>{t('agency.rules.newHint')}</DialogDescription>
        <div className="mt-4 max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          <label className="block">
            <span className={labelClass}>{t('schedules.form.name')}</span>
            <input value={name} maxLength={80} data-testid="agency-rule-name" onChange={(event) => setName(event.target.value)} className={inputClass} />
          </label>

          <div role="radiogroup" aria-label={t('agency.rules.kind')} className="grid grid-cols-2 gap-2">
            {(['tool', 'agent'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={kind === value}
                data-testid={`agency-rule-kind-${value}`}
                onClick={() => setKind(value)}
                className={`flex flex-col justify-start rounded-xl border px-3 py-2 text-left text-sm transition-colors ${kind === value ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]' : 'border-[var(--border)] text-[var(--text-muted)]'}`}
              >
                <span className="block font-medium">{t(`agency.rules.kind.${value}` as I18nKey)}</span>
                <span className="block text-xs text-[var(--text-subtle)]">{t(`agency.rules.kind.${value}Hint` as I18nKey)}</span>
              </button>
            ))}
          </div>

          <ScheduleSpecField spec={schedule} onChange={setSchedule} />

          {kind === 'agent' ? (
            <label className="block">
              <span className={labelClass}>{t('agency.rules.prompt')}</span>
              <textarea value={prompt} rows={4} maxLength={8000} data-testid="agency-rule-prompt" onChange={(event) => setPrompt(event.target.value)} className={inputClass} />
            </label>
          ) : connectors.length === 0 ? (
            <p className="field-hint" role="status">{t('agency.rules.noConnectors')}</p>
          ) : (
            <section className="space-y-3">
              <ConnectorToolFields connectors={connectors} server={server} tool={tool} onServer={setServer} onTool={setTool} idPrefix="agency-rule" />
              <label className="block">
                <span className={labelClass}>{t('agency.rules.arguments')}</span>
                <textarea value={args} rows={3} spellCheck={false} data-testid="agency-rule-args" onChange={(event) => setArgs(event.target.value)} className={`${inputClass} font-mono`} />
              </label>
              <label className="block">
                <span className={labelClass}>{t('agency.rules.onResultLabel')}</span>
                <select value={onResult} data-testid="agency-rule-on-result" onChange={(event) => setOnResult(event.target.value as ScheduledToolSpec['on_result'])} className={inputClass}>
                  {ON_RESULT.map((value) => <option key={value} value={value}>{t(`agency.rules.onResult.${value}` as I18nKey)}</option>)}
                </select>
              </label>
              {onResult === 'deliver' && (
                <div className="space-y-3 rounded-xl border border-[var(--border)] p-3">
                  <ConnectorToolFields connectors={connectors} server={deliverServer} tool={deliverTool} onServer={setDeliverServer} onTool={setDeliverTool} idPrefix="agency-rule-deliver" />
                  <label className="block">
                    <span className={labelClass}>{t('agency.rules.arguments')}</span>
                    <textarea value={deliverArgs} rows={3} spellCheck={false} onChange={(event) => setDeliverArgs(event.target.value)} className={`${inputClass} font-mono`} />
                    <span className="mt-1 block text-xs text-[var(--text-subtle)]">{t('agency.rules.deliverHint')}</span>
                  </label>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={labelClass}>{t('agency.rules.onlyIfLabel')}</span>
                  <input value={onlyIf} onChange={(event) => setOnlyIf(event.target.value)} className={inputClass} />
                </label>
                <label className="block">
                  <span className={labelClass}>{t('agency.rules.maxPerDay')}</span>
                  <input type="number" min={1} value={maxPerDay} onChange={(event) => setMaxPerDay(event.target.value)} className={inputClass} />
                </label>
              </div>
            </section>
          )}

          <label className="block">
            <span className={labelClass}>{t('agency.rules.watchLabel')}</span>
            <input value={watch} spellCheck={false} onChange={(event) => setWatch(event.target.value)} className={`${inputClass} font-mono`} />
          </label>

          {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-ghost">{t('common.cancel')}</button>
          <button type="button" onClick={add} className="btn btn-primary" data-testid="agency-rule-add">{t('agency.rules.add')}</button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

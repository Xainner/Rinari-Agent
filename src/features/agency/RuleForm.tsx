import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import { useI18n, type I18nKey } from '../../i18n'
import { inputClass, labelClass } from '../../lib/ui'
import { engineApi, type ScheduleSpec, type ScheduledTaskInput, type ScheduledToolSpec } from '../../services/engine'
import ScheduleSpecField from '../schedules/ScheduleSpecField'
import { specProblem } from '../schedules/scheduleModel'

const ON_RESULT: ScheduledToolSpec['on_result'][] = ['notify', 'nothing', 'agent', 'deliver']
// Los límites con que el Engine valida una regla (`_tool`, `_watch`): lo que
// los pase aquí no podría activarse después.
const MAX_ARGUMENTS = 8000
const MAX_PER_DAY = 1000
const MAX_ONLY_IF = 200
const MAX_TOOL_NAME = 256
const MAX_PATH = 1000
const MAX_PROMPT = 8000

/** Un objeto JSON escrito a mano, o `null` si no lo es. */
function parseArguments(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text.trim() || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch {
    return null
  }
}

/**
 * El largo de los argumentos medido como el Engine (`json.dumps` de Python):
 * con espacio tras `,` y `:`, y lo que no es ASCII escrito como `\uXXXX`.
 */
function argumentsSize(value: unknown): number {
  if (Array.isArray(value)) return 2 + value.reduce<number>((sum, item, index) => sum + argumentsSize(item) + (index ? 2 : 0), 0)
  if (value && typeof value === 'object') {
    return 2 + Object.entries(value).reduce<number>((sum, [key, item], index) => sum + argumentsSize(key) + 2 + argumentsSize(item) + (index ? 2 : 0), 0)
  }
  const text = JSON.stringify(value) ?? 'null'
  return typeof value === 'string' ? text.length + 5 * (text.match(/[^\x00-\x7f]/g)?.length ?? 0) : text.length
}

/** Una ruta absoluta (unidad, UNC, raíz o `~`): el Engine no vigila otra. */
function isAbsolutePath(path: string): boolean {
  return /^([a-zA-Z]:[\\/]|[\\/]|~([\\/]|$))/.test(path)
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
          <input value={tool} maxLength={MAX_TOOL_NAME} data-testid={`${idPrefix}-tool`} spellCheck={false} onChange={(event) => onTool(event.target.value)} className={`${inputClass} font-mono`} />
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
  const [deliverArgs, setDeliverArgs] = useState('{}')
  const [onlyIf, setOnlyIf] = useState('')
  const [maxPerDay, setMaxPerDay] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setName(''); setKind('tool'); setSchedule({ kind: 'interval', minutes: 60 }); setPrompt(''); setWatch('')
    setServer(''); setTool(''); setArgs('{}'); setOnResult('notify')
    setDeliverServer(''); setDeliverTool(''); setDeliverArgs('{}'); setOnlyIf(''); setMaxPerDay(''); setError('')
    let live = true
    engineApi.agencyAgent(agentId)
      .then((result) => { if (live) setConnectors(result.agent.connectors) })
      .catch(() => { if (live) setConnectors([]) })
    return () => { live = false }
  }, [open, agentId])

  // Cambiar cualquier campo quita el error del intento anterior.
  const edit = <T,>(set: (value: T) => void) => (value: T) => {
    set(value)
    setError('')
  }

  const argumentsProblem = (text: string): string | null => {
    const value = parseArguments(text)
    if (!value) return t('agency.rules.badJson')
    return argumentsSize(value) > MAX_ARGUMENTS ? t('agency.rules.argsTooLong', { max: MAX_ARGUMENTS }) : null
  }

  const problem = (): string | null => {
    if (!name.trim()) return t('schedules.form.needName')
    const spec = specProblem(schedule, t)
    if (spec) return spec
    if (watch.trim() && !isAbsolutePath(watch.trim())) return t('agency.rules.badWatch')
    if (kind === 'agent') return prompt.trim() ? null : t('schedules.form.needPrompt')
    if (!server || !tool.trim()) return t('agency.rules.needTool')
    const argsProblem = argumentsProblem(args)
    if (argsProblem) return argsProblem
    if (onResult === 'deliver') {
      if (!deliverServer || !deliverTool.trim()) return t('agency.rules.needTool')
      const deliverProblem = argumentsProblem(deliverArgs)
      if (deliverProblem) return deliverProblem
    }
    const perDay = Number(maxPerDay)
    if (maxPerDay.trim() && !(Number.isInteger(perDay) && perDay >= 1 && perDay <= MAX_PER_DAY)) return t('agency.rules.badMaxPerDay', { max: MAX_PER_DAY })
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
      // Una regla de conector usa el texto solo si le pasa el resultado al agente.
      prompt: kind === 'agent' || onResult === 'agent' ? prompt.trim() : '',
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
            <input value={name} maxLength={80} data-testid="agency-rule-name" onChange={(event) => edit(setName)(event.target.value)} className={inputClass} />
          </label>

          <div role="radiogroup" aria-label={t('agency.rules.kind')} className="grid grid-cols-2 gap-2">
            {(['tool', 'agent'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={kind === value}
                data-testid={`agency-rule-kind-${value}`}
                onClick={() => edit(setKind)(value)}
                className={`flex flex-col justify-start rounded-xl border px-3 py-2 text-left text-sm transition-colors ${kind === value ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]' : 'border-[var(--border)] text-[var(--text-muted)]'}`}
              >
                <span className="block font-medium">{t(`agency.rules.kind.${value}` as I18nKey)}</span>
                <span className="block text-xs text-[var(--text-subtle)]">{t(`agency.rules.kind.${value}Hint` as I18nKey)}</span>
              </button>
            ))}
          </div>

          <ScheduleSpecField spec={schedule} onChange={edit(setSchedule)} />

          {kind === 'agent' ? (
            <label className="block">
              <span className={labelClass}>{t('agency.rules.prompt')}</span>
              <textarea value={prompt} rows={4} maxLength={MAX_PROMPT} data-testid="agency-rule-prompt" onChange={(event) => edit(setPrompt)(event.target.value)} className={inputClass} />
            </label>
          ) : connectors.length === 0 ? (
            <p className="field-hint" role="status">{t('agency.rules.noConnectors')}</p>
          ) : (
            <section className="space-y-3">
              <ConnectorToolFields connectors={connectors} server={server} tool={tool} onServer={edit(setServer)} onTool={edit(setTool)} idPrefix="agency-rule" />
              <label className="block">
                <span className={labelClass}>{t('agency.rules.arguments')}</span>
                <textarea value={args} rows={3} spellCheck={false} data-testid="agency-rule-args" onChange={(event) => edit(setArgs)(event.target.value)} className={`${inputClass} font-mono`} />
              </label>
              <label className="block">
                <span className={labelClass}>{t('agency.rules.onResultLabel')}</span>
                <select value={onResult} data-testid="agency-rule-on-result" onChange={(event) => edit(setOnResult)(event.target.value as ScheduledToolSpec['on_result'])} className={inputClass}>
                  {ON_RESULT.map((value) => <option key={value} value={value}>{t(`agency.rules.onResult.${value}` as I18nKey)}</option>)}
                </select>
              </label>
              {onResult === 'agent' && (
                <label className="block">
                  <span className={labelClass}>{t('agency.rules.resultPrompt')}</span>
                  <textarea value={prompt} rows={3} maxLength={MAX_PROMPT} data-testid="agency-rule-result-prompt" onChange={(event) => edit(setPrompt)(event.target.value)} className={inputClass} />
                </label>
              )}
              {onResult === 'deliver' && (
                // Un grupo con nombre: su conector, herramienta y argumentos no se confunden con los de arriba.
                <fieldset className="rounded-xl border border-[var(--border)] p-3" data-testid="agency-rule-deliver">
                  <legend className={`${labelClass} float-left w-full`}>{t('agency.rules.deliverLegend')}</legend>
                  <div className="clear-both space-y-3">
                    <ConnectorToolFields connectors={connectors} server={deliverServer} tool={deliverTool} onServer={edit(setDeliverServer)} onTool={edit(setDeliverTool)} idPrefix="agency-rule-deliver" />
                    <label className="block">
                      <span className={labelClass}>{t('agency.rules.arguments')}</span>
                      <textarea value={deliverArgs} rows={3} spellCheck={false} onChange={(event) => edit(setDeliverArgs)(event.target.value)} className={`${inputClass} font-mono`} />
                      <span className="mt-1 block text-xs text-[var(--text-subtle)]">{t('agency.rules.deliverHint')}</span>
                    </label>
                  </div>
                </fieldset>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={labelClass}>{t('agency.rules.onlyIfLabel')}</span>
                  <input value={onlyIf} maxLength={MAX_ONLY_IF} onChange={(event) => edit(setOnlyIf)(event.target.value)} className={inputClass} />
                </label>
                <label className="block">
                  <span className={labelClass}>{t('agency.rules.maxPerDay')}</span>
                  <input type="number" min={1} max={MAX_PER_DAY} step={1} value={maxPerDay} onChange={(event) => edit(setMaxPerDay)(event.target.value)} className={inputClass} />
                </label>
              </div>
            </section>
          )}

          <label className="block">
            <span className={labelClass}>{t('agency.rules.watchLabel')}</span>
            <input value={watch} maxLength={MAX_PATH} spellCheck={false} onChange={(event) => edit(setWatch)(event.target.value)} className={`${inputClass} font-mono`} />
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

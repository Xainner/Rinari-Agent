import { useCallback, useEffect, useState } from 'react'
import { Pause, Play, Trash2, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n, type I18nKey } from '../../i18n'
import { commandMessage, engineApi, onEngineEvent, type ScheduledTask, type ScheduledTaskInput, type ScheduledToolSpec } from '../../services/engine'
import { describeSchedule, formatWhen, SCHEDULES_CHANGED_EVENT } from '../schedules/scheduleModel'
import { useAgencyStore } from '../../stores/agency'

interface RulesViewProps {
  /** El chat directo abierto; su agente sale del store de la Agency. */
  sessionId: string
}

/** Las partes de una regla, como en la sección 10.1 del plan: cuándo, qué, a dónde, límites. */
function RuleParts({ rule }: { rule: Pick<ScheduledTaskInput, 'schedule' | 'tool' | 'prompt'> }) {
  const { t, lang } = useI18n()
  const tool: ScheduledToolSpec | null | undefined = rule.tool
  const locale = lang === 'es' ? 'es' : 'en'
  return (
    <dl className="agency-rule-parts">
      <dt>{t('agency.rules.when')}</dt>
      <dd>{describeSchedule(rule.schedule, t, locale)}</dd>
      {tool ? (
        <>
          <dt>{t('agency.rules.what')}</dt>
          <dd>
            <code>{tool.server} · {tool.tool}</code>
            {Object.keys(tool.arguments ?? {}).length > 0 && (
              <code className="agency-rule-args">{JSON.stringify(tool.arguments)}</code>
            )}
          </dd>
          <dt>{t('agency.rules.where')}</dt>
          <dd>
            {tool.on_result === 'deliver' && tool.deliver
              ? <code>{tool.deliver.server} · {tool.deliver.tool}</code>
              : t(`agency.rules.onResult.${tool.on_result}` as I18nKey)}
          </dd>
          {tool.max_per_day ? (
            <>
              <dt>{t('agency.rules.limits')}</dt>
              <dd>{t('agency.rules.perDay', { n: tool.max_per_day })}</dd>
            </>
          ) : null}
        </>
      ) : (
        <>
          <dt>{t('agency.rules.what')}</dt>
          <dd className="truncate">{rule.prompt}</dd>
        </>
      )}
    </dl>
  )
}

/**
 * La vista «Reglas» del panel lateral (D-18): las reglas permanentes del
 * agente cuyo chat está abierto, las que propuso y esperan al dueño, y sus
 * últimas ejecuciones. Activar una regla es aprobarla (§14.3): nunca se crea
 * sola. Pausar, ejecutar ahora y borrar usan las tareas programadas.
 */
export default function RulesView({ sessionId }: RulesViewProps) {
  const { t, lang } = useI18n()
  const agentId = useAgencyStore((state) => state.agentSessions[sessionId] ?? null)
  const locale = lang === 'es' ? 'es' : 'en'
  const proposals = useAgencyStore((state) => state.proposals).filter((item) => item.agent_id === agentId)
  const dropProposal = useAgencyStore((state) => state.dropProposal)
  const [rules, setRules] = useState<ScheduledTask[]>([])

  const reload = useCallback(async () => {
    if (!agentId) return
    try {
      const result = await engineApi.scheduleList()
      setRules(result.tasks.filter((task) => task.agent_id === agentId))
    } catch {
      // El Engine puede estar reiniciando: se conserva lo último.
    }
  }, [agentId])

  useEffect(() => {
    void reload()
    let stop: (() => void) | undefined
    let disposed = false
    void onEngineEvent((event) => {
      if (event.event.startsWith('schedule.') && event.event !== 'schedule.proposed') void reload()
    }).then((unlisten) => {
      if (disposed) unlisten()
      else stop = unlisten
    })
    return () => {
      disposed = true
      stop?.()
    }
  }, [reload])

  const act = async (work: () => Promise<unknown>) => {
    try {
      await work()
      window.dispatchEvent(new Event(SCHEDULES_CHANGED_EVENT))
      await reload()
    } catch (error) {
      toast.error(commandMessage(error))
    }
  }

  if (!agentId) return null
  return (
    <div className="agency-rules" data-testid="agency-rules">
      {proposals.map((proposal, index) => (
        <article key={`proposal-${index}`} className="agency-rule is-proposal" data-testid="agency-rule-proposal">
          <header className="agency-rule-head">
            <Zap size={14} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate font-semibold">{proposal.name}</span>
            <span className="r-chip" data-tone="warning">{t('agency.rules.proposed')}</span>
          </header>
          <RuleParts rule={proposal} />
          <p className="field-hint">{t('agency.rules.approveHint')}</p>
          <footer className="agency-rule-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => dropProposal(proposal)}>
              {t('agency.rules.discard')}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              data-testid="agency-rule-activate"
              onClick={() => void act(async () => {
                await engineApi.scheduleCreate(proposal)
                dropProposal(proposal)
                toast.success(t('agency.rules.activated', { name: proposal.name }))
              })}
            >
              {t('agency.rules.activate')}
            </button>
          </footer>
        </article>
      ))}

      {rules.length === 0 && proposals.length === 0 && (
        <p className="dock-empty-line">{t('agency.rules.empty')}</p>
      )}

      {rules.map((rule) => (
        <article key={rule.id} className="agency-rule" data-testid="agency-rule" data-enabled={rule.enabled || undefined}>
          <header className="agency-rule-head">
            <Zap size={14} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate font-semibold">{rule.name}</span>
            <span className="r-chip" data-tone={rule.enabled ? 'success' : undefined}>
              {rule.enabled ? t('agency.rules.active') : t('agency.rules.paused')}
            </span>
          </header>
          <RuleParts rule={rule} />
          {rule.last_run && (
            <p className="field-hint">
              {t('agency.rules.lastRun', {
                status: t(`schedules.status.${rule.last_run.status}` as I18nKey),
                when: formatWhen(rule.last_run.started_at, locale),
              })}
              {rule.last_run.reason ? ` · ${rule.last_run.reason}` : ''}
            </p>
          )}
          <footer className="agency-rule-actions">
            <button type="button" className="btn btn-quiet btn-xs" onClick={() => void act(() => engineApi.scheduleDelete(rule.id))} aria-label={t('agency.rules.delete')} title={t('agency.rules.delete')}>
              <Trash2 size={13} aria-hidden="true" />
            </button>
            <span className="flex-1" />
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => void act(() => engineApi.scheduleUpdate(rule.id, { enabled: !rule.enabled }))}>
              {rule.enabled ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
              {rule.enabled ? t('agency.rules.pause') : t('agency.rules.resume')}
            </button>
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => void act(() => engineApi.scheduleRunNow(rule.id))}>
              {t('agency.rules.runNow')}
            </button>
          </footer>
        </article>
      ))}
    </div>
  )
}

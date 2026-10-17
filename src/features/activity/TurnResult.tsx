import { CircleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { memo, type ReactNode } from 'react'
import { hasTranslation, useI18n, type I18nKey } from '../../i18n'
import { commandMessage, engineApi, errorText } from '../../services/engine'
import { copyText } from '../../lib/clipboard'
import { useUIStore } from '../../stores/ui'
import PlanCard from '../plan/PlanCard'
import MessageBubble from '../../components/MessageBubble'
import { useResultVisibility } from '../board/useResultVisibility'
import { ChangeSetRow } from './ChangeSetRow'
import type { TurnTimeline, ModelTimelineItem } from './types'
import { presentedChangeSets } from './changeSetPresentation'
import { failureTab, turnFailure, type TurnFailure } from './turnFailure'
import { AutoResume } from '../resume/AutoResume'
import { useOptionalEngineCommands } from '../engine/EngineContext'
import { useCalmMotion } from '../../lib/motion'
import { ReturnPill, useReturnMark } from './ReturnMark'

export interface TurnResultProps {
  timeline: TurnTimeline
  /** Acción única de implementación para un PLAN (la aporta la conversación). */
  planActions?: ReactNode
  provisional?: ModelTimelineItem
}

const TERMINAL = new Set(['completed', 'failed', 'stopped', 'cancelled'])
const ACTIVE = new Set(['running', 'approval', 'cancelling'])

/**
 * Respuesta final canónica de un turno. Es el único lugar donde se pinta el
 * cuerpo terminado, en Normal y en Boards: Markdown completo (código, enlaces,
 * imágenes, acciones de copiar) o el plan original con su acción explícita,
 * el changeset confirmado del turno y, si falló, el error y su diagnóstico.
 * `completed`, `failed`, `stopped` y `cancelled` conservan su identidad; no se
 * normalizan a un mensaje genérico. Cambiar el modo actual no altera cómo se
 * ve un turno histórico: `timeline.mode` es el del turno.
 *
 * El bloque entero es el ancla de lectura (`useResultVisibility`): un
 * resultado cuenta como leído cuando su cuerpo real está en pantalla, no
 * cuando un marcador de 1 px asoma.
 */
function TurnResult({ timeline, planActions, provisional }: TurnResultProps) {
  const { t } = useI18n()
  const final = provisional ?? [...timeline.items].reverse().find((item) => item.type === 'model' && item.outputKind === 'final' && item.content)
  const { changes: changeSets } = presentedChangeSets(timeline)
  const terminal = TERMINAL.has(timeline.status)
  const ref = useResultVisibility(timeline.turnId, terminal)
  // Terminó mientras no estabas (#62): borde con brillo y «Nuevo · terminó hace…» hasta que se lee.
  const calm = useCalmMotion()
  const back = useReturnMark(timeline.turnId, calm)
  const failed = timeline.status === 'failed'
  if (!final && changeSets.length === 0 && !failed) return null
  return (
    <div ref={ref} data-testid="turn-result" data-turn-id={timeline.turnId} data-status={timeline.status} data-return={back.state ?? undefined} className="turn-result space-y-3">
      {back.state && <ReturnPill outcome={back.outcome} completedAt={back.completedAt} />}
      {provisional && terminal && <p className="text-xs text-[var(--warning)]">{t('activity.partialText')}</p>}
      {final?.type === 'model' && (timeline.mode === 'plan' && !provisional
        ? (
          // El plan, como tarjeta compacta; entero en la vista «Plan» del panel lateral (#55).
          <PlanCard content={final.content} turnId={timeline.turnId} actions={planActions} />
        )
        : <>
          <MessageBubble message={{ id: final.id, role: 'assistant', content: final.content, createdAt: final.occurredAt, turnId: timeline.turnId }} />
        </>)}
      {changeSets.map((item) => <ChangeSetRow key={item.id} item={item} turnActive={ACTIVE.has(timeline.status)} />)}
      {failed && <FailureCause timeline={timeline} />}
      {failed && timeline.errorDetails?.history_preserved === true && (
        <p className="text-xs text-[var(--text-muted)]">{t('turnResult.historyPreserved')}</p>
      )}
      {failed && timeline.errorDetails && <FailureDiagnostics details={timeline.errorDetails} code={timeline.errorCode} />}
    </div>
  )
}

/**
 * La razón real del fallo, dicha claro, con la acción que ayuda: revisar uso
 * y límites, la conexión o los modelos del proveedor **que falló** (no del
 * seleccionado ahora). El mensaje del proveedor sigue debajo, tal cual.
 */
/** Causas que no se arreglan reintentando con el mismo modelo: se ofrece otro. */
const SWITCHABLE = new Set(['quota', 'rate', 'limit', 'auth', 'access', 'model', 'disabled'])
/** A provider limit: the conversation can continue by itself when it resets (#24). */
const LIMITS = new Set(['quota', 'rate', 'limit'])
/** Causas cuyo texto crudo es de Rinari (en inglés), no del proveedor. */
const OWN_TEXT = new Set(['disabled', 'engine', 'stream'])

/** Datos del diagnóstico con su etiqueta; lo demás se lista con su nombre. */
const DIAG_KEYS = ['reason', 'recoverable', 'reconciled', 'history_preserved', 'provider_alias', 'model', 'http_status', 'provider_error_code', 'provider_response_code', 'limit_kind', 'retry_after_s', 'resets_at', 'request_id', 'kind', 'close', 'attempts'] as const
const DIAG_HIDDEN = new Set(['partial_text', 'provider_id', 'provider'])

/**
 * «Diagnóstico de la interrupción» (#68): una lista con etiquetas en el idioma
 * de la app y «Copiar diagnóstico» para el JSON entero, en vez del JSON crudo.
 */
function FailureDiagnostics({ details, code }: { details: Record<string, unknown>; code?: string }) {
  const { t } = useI18n()
  const value = (key: string, raw: unknown): string => {
    if (typeof raw === 'boolean') return t(raw ? 'diag.yes' : 'diag.no')
    if (key === 'reason' && typeof raw === 'string' && hasTranslation(`diag.reason.${raw}`)) return t(`diag.reason.${raw}` as I18nKey)
    return typeof raw === 'string' || typeof raw === 'number' ? String(raw) : JSON.stringify(raw)
  }
  const label = (key: string) => (key === 'provider_alias' ? t('diag.provider') : hasTranslation(`diag.${key}`) ? t(`diag.${key}` as I18nKey) : key)
  const known: string[] = DIAG_KEYS.filter((key) => details[key] !== undefined && details[key] !== null && details[key] !== '')
  const rest = Object.keys(details).filter((key) => !DIAG_HIDDEN.has(key) && !(DIAG_KEYS as readonly string[]).includes(key) && details[key] !== undefined && details[key] !== null)
  const rows: Array<[string, string]> = [...(code ? [[t('diag.code'), code] as [string, string]] : []), ...[...known, ...rest].map((key) => [label(key), value(key, details[key])] as [string, string])]
  const json = JSON.stringify({ ...(code ? { code } : {}), ...Object.fromEntries(Object.entries(details).filter(([key]) => key !== 'partial_text')) }, null, 2)
  return (
    <details className="failure-diag text-xs text-[var(--text-subtle)]" data-testid="failure-diagnostics">
      <summary className="cursor-pointer">{t('turnResult.diagnostics')}</summary>
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2">
        {rows.map(([name, text]) => (
          <div key={name} className="contents">
            <dt className="text-[var(--text-muted)]">{name}</dt>
            <dd className="min-w-0 break-words text-[var(--text)]">{text}</dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        className="btn btn-secondary btn-xs mt-1.5"
        onClick={() => { void copyText(json).then((ok) => { if (ok) toast.success(t('turnResult.copied')) }) }}
      >
        {t('turnResult.copyDiagnostics')}
      </button>
    </details>
  )
}

function FailureCause({ timeline }: { timeline: TurnTimeline }) {
  const { t } = useI18n()
  const openProvider = useUIStore((s) => s.openProvider)
  const requestModelPicker = useUIStore((s) => s.requestModelPicker)
  const cause = turnFailure(timeline.errorDetails, timeline.errorCode)
  const commands = useOptionalEngineCommands()
  const raw = timeline.error || t('turnResult.failed')
  if (!cause) {
    // Sin causa acreditada, el error se dice por su código en el idioma de la app (#68).
    return (
      <div role="alert" className="flex items-center gap-2 py-1 text-[13px] text-[var(--danger)]">
        <CircleAlert size={13} />{timeline.errorCode ? errorText(timeline.errorCode, timeline.error) : raw}
      </div>
    )
  }
  const tab = failureTab(cause.kind)
  const provider = cause.providerAlias ?? t('failure.theProvider')
  const model = cause.model ?? t('failure.thisModel')
  return (
    <div role="alert" data-failure={cause.kind} className="space-y-1.5 rounded-xl border border-red-500/25 bg-red-500/5 px-3 py-2.5">
      <div className="flex items-start gap-2 text-[13px] text-[var(--danger)]">
        <CircleAlert size={14} className="mt-0.5 shrink-0" />
        <span>
          {t(`failure.${cause.kind}` as I18nKey, { provider, model })}
          {cause.retryAfterS !== undefined && <> {t('failure.retryAfter', { seconds: Math.ceil(cause.retryAfterS) })}</>}
        </span>
      </div>
      {/* Debajo van las palabras del proveedor. «Desactivado», el motor que se
          cerró y la respuesta cortada son textos de Rinari que la frase de
          arriba ya dice en el idioma de la app (#97, #68). */}
      {!OWN_TEXT.has(cause.kind) && <p className="pl-[22px] text-xs break-words text-[var(--text-muted)]">{raw}</p>}
      {(tab || cause.kind === 'context' || cause.kind === 'disabled') && (
        <div className="flex flex-wrap items-center gap-2 pl-[22px]">
          {SWITCHABLE.has(cause.kind) && timeline.sessionId && (
            <button
              type="button"
              data-testid="failure-switch-model"
              onClick={() => requestModelPicker(timeline.sessionId)}
              className="btn btn-secondary btn-xs"
            >
              {t('failure.action.switchModel')}
            </button>
          )}
          {tab && (
            <button
              type="button"
              onClick={() => openProvider({ providerId: cause.providerId, alias: cause.providerAlias, tab })}
              className="btn btn-secondary btn-xs"
            >
              {t(`failure.action.${tab}` as I18nKey)}
            </button>
          )}
          {cause.kind === 'disabled' && cause.providerAlias && (
            <button
              type="button"
              data-testid="failure-enable-provider"
              onClick={() => {
                const alias = cause.providerAlias!
                void engineApi.providerUpdate(alias, { enabled: true })
                  .then(() => {
                    toast.success(t('providers.enabledToast', { name: alias }))
                    return commands?.refreshCatalog(false)
                  })
                  .catch((error) => toast.error(commandMessage(error)))
              }}
              className="btn btn-secondary btn-xs"
            >
              {t('failure.action.enableProvider', { provider })}
            </button>
          )}
          {cause.kind === 'context' && (
            <button
              type="button"
              onClick={() => { void engineApi.contextCompact(timeline.sessionId).catch((error) => toast.error(commandMessage(error))) }}
              className="btn btn-secondary btn-xs"
            >
              {t('failure.action.compact')}
            </button>
          )}
          {tab && !cause.providerId && !cause.providerAlias && <span className="text-[11px] text-[var(--text-subtle)]">{t('failure.providerUnknown')}</span>}
        </div>
      )}
      {LIMITS.has(cause.kind) && timeline.sessionId && (
        <AutoResume sessionId={timeline.sessionId} resetsAt={cause.resetsAt} failedAt={timeline.completedAt} />
      )}
    </div>
  )
}

export type { TurnFailure }

export default memo(TurnResult)

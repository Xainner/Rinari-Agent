import { CircleAlert, ListTree } from 'lucide-react'
import { toast } from 'sonner'
import { memo, type ReactNode } from 'react'
import { useI18n, type I18nKey } from '../../i18n'
import { commandMessage, engineApi } from '../../services/engine'
import { useUIStore } from '../../stores/ui'
import Markdown from '../../components/Markdown'
import MessageBubble from '../../components/MessageBubble'
import { useResultVisibility } from '../board/useResultVisibility'
import { ChangeSetRow } from './ChangeSetRow'
import type { TurnTimeline } from './types'
import { presentedChangeSets } from './changeSetPresentation'
import { CoverageWarning } from './CoverageWarning'
import { ModelChangeNotice } from './ModelChangeNotice'
import { failureTab, turnFailure, type TurnFailure } from './turnFailure'

export interface TurnResultProps {
  timeline: TurnTimeline
  /** Acción única de implementación para un PLAN (la aporta la conversación). */
  planActions?: ReactNode
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
function TurnResult({ timeline, planActions }: TurnResultProps) {
  const { lang } = useI18n()
  const final = [...timeline.items].reverse().find((item) => item.type === 'model' && item.outputKind === 'final' && item.content)
  const { changes: changeSets, emptyPartial } = presentedChangeSets(timeline)
  const terminal = TERMINAL.has(timeline.status)
  const ref = useResultVisibility(timeline.turnId, terminal)
  const failed = timeline.status === 'failed'
  if (!final && changeSets.length === 0 && emptyPartial.length === 0 && !failed) return null
  return (
    <div ref={ref} data-testid="turn-result" data-turn-id={timeline.turnId} data-status={timeline.status} className="space-y-3">
      {final?.type === 'model' && (timeline.mode === 'plan'
        ? (
          <section aria-label={lang === 'es' ? 'Plan propuesto' : 'Proposed plan'} className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><ListTree size={16} />{lang === 'es' ? 'Plan propuesto' : 'Proposed plan'}</div>
            <Markdown>{final.content}</Markdown>
            {final.modelChange && <ModelChangeNotice change={final.modelChange} />}
            {planActions}
          </section>
        )
        : <>
          <MessageBubble message={{ id: final.id, role: 'assistant', content: final.content, createdAt: final.occurredAt, turnId: timeline.turnId }} />
          {final.modelChange && <ModelChangeNotice change={final.modelChange} />}
        </>)}
      {changeSets.map((item) => <ChangeSetRow key={item.id} item={item} turnActive={ACTIVE.has(timeline.status)} />)}
      {emptyPartial.length > 0 && <CoverageWarning warnings={emptyPartial.flatMap(item => item.warnings)} />}
      {failed && <FailureCause timeline={timeline} />}
      {failed && timeline.errorDetails?.history_preserved === true && (
        <p className="text-xs text-[var(--text-muted)]">{lang === 'es' ? 'El trabajo previo está conservado. Puedes enviar un nuevo mensaje; las acciones de resultado desconocido requieren comprobar su estado.' : 'Previous work is preserved. You can send a new message; unknown action outcomes require checking their state.'}</p>
      )}
      {failed && timeline.errorDetails && (
        <details className="text-xs text-[var(--text-subtle)]">
          <summary>{lang === 'es' ? 'Diagnóstico de la interrupción' : 'Interruption diagnostics'}</summary>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify(Object.fromEntries(Object.entries(timeline.errorDetails).filter(([key]) => key !== 'partial_text')), null, 2)}</pre>
        </details>
      )}
    </div>
  )
}

/**
 * La razón real del fallo, dicha claro, con la acción que ayuda: revisar uso
 * y límites, la conexión o los modelos del proveedor **que falló** (no del
 * seleccionado ahora). El mensaje del proveedor sigue debajo, tal cual.
 */
function FailureCause({ timeline }: { timeline: TurnTimeline }) {
  const { t, lang } = useI18n()
  const openProvider = useUIStore((s) => s.openProvider)
  const cause = turnFailure(timeline.errorDetails)
  const raw = timeline.error || (lang === 'es' ? 'El turno falló' : 'Turn failed')
  if (!cause) {
    return (
      <div role="alert" className="flex items-center gap-2 py-1 text-[13px] text-red-400">
        <CircleAlert size={13} />{raw}
      </div>
    )
  }
  const tab = failureTab(cause.kind)
  const provider = cause.providerAlias ?? t('failure.theProvider')
  const model = cause.model ?? t('failure.thisModel')
  return (
    <div role="alert" data-failure={cause.kind} className="space-y-1.5 rounded-xl border border-red-500/25 bg-red-500/5 px-3 py-2.5">
      <div className="flex items-start gap-2 text-[13px] text-red-300">
        <CircleAlert size={14} className="mt-0.5 shrink-0" />
        <span>
          {t(`failure.${cause.kind}` as I18nKey, { provider, model })}
          {cause.retryAfterS !== undefined && <> {t('failure.retryAfter', { seconds: Math.ceil(cause.retryAfterS) })}</>}
        </span>
      </div>
      <p className="pl-[22px] text-xs break-words text-[var(--text-muted)]">{raw}</p>
      {(tab || cause.kind === 'context') && (
        <div className="flex flex-wrap items-center gap-2 pl-[22px]">
          {tab && (
            <button
              type="button"
              onClick={() => openProvider({ providerId: cause.providerId, alias: cause.providerAlias, tab })}
              className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-semibold text-[var(--text)] transition-colors hover:bg-[var(--bg-hover)]"
            >
              {t(`failure.action.${tab}` as I18nKey)}
            </button>
          )}
          {cause.kind === 'context' && (
            <button
              type="button"
              onClick={() => { void engineApi.contextCompact(timeline.sessionId).catch((error) => toast.error(commandMessage(error))) }}
              className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-semibold text-[var(--text)] transition-colors hover:bg-[var(--bg-hover)]"
            >
              {t('failure.action.compact')}
            </button>
          )}
          {tab && !cause.providerId && !cause.providerAlias && <span className="text-[11px] text-[var(--text-subtle)]">{t('failure.providerUnknown')}</span>}
        </div>
      )}
    </div>
  )
}

export type { TurnFailure }

export default memo(TurnResult)

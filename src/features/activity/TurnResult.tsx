import { CircleAlert, ListTree } from 'lucide-react'
import { memo, type ReactNode } from 'react'
import { useI18n } from '../../i18n'
import Markdown from '../../components/Markdown'
import MessageBubble from '../../components/MessageBubble'
import { useResultVisibility } from '../board/useResultVisibility'
import { ChangeSetRow } from './ChangeSetRow'
import type { TurnTimeline } from './types'

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
  const changeSets = timeline.items.filter((item) => item.type === 'changeset')
  const terminal = TERMINAL.has(timeline.status)
  const ref = useResultVisibility(timeline.turnId, terminal)
  const failed = timeline.status === 'failed'
  if (!final && changeSets.length === 0 && !failed) return null
  return (
    <div ref={ref} data-testid="turn-result" data-turn-id={timeline.turnId} data-status={timeline.status} className="space-y-3">
      {final?.type === 'model' && (timeline.mode === 'plan'
        ? (
          <section aria-label={lang === 'es' ? 'Plan propuesto' : 'Proposed plan'} className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><ListTree size={16} />{lang === 'es' ? 'Plan propuesto' : 'Proposed plan'}</div>
            <Markdown>{final.content}</Markdown>
            {planActions}
          </section>
        )
        : <MessageBubble message={{ id: final.id, role: 'assistant', content: final.content, createdAt: final.occurredAt, turnId: timeline.turnId }} />)}
      {changeSets.map((item) => <ChangeSetRow key={item.id} item={item} turnActive={ACTIVE.has(timeline.status)} />)}
      {failed && (
        <div role="alert" className="flex items-center gap-2 py-1 text-[13px] text-red-400">
          <CircleAlert size={13} />{timeline.error || (lang === 'es' ? 'El turno falló' : 'Turn failed')}
        </div>
      )}
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

export default memo(TurnResult)

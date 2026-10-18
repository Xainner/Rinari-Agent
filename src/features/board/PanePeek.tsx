import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { CircleHelp, ShieldAlert } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { PaneSession } from './usePaneSession'
import type { PaneDigest } from './paneDigest'

/** Pausa antes de abrir el vistazo: pasar de largo no lo abre (plan-boards B.2). */
export const PEEK_OPEN_DELAY_MS = 300
/** Margen para cruzar del panel a la tarjeta sin que se cierre. */
const PEEK_CLOSE_GRACE_MS = 140

/**
 * Abrir y cerrar el vistazo de un panel plegado: al pasar el ratón tras una
 * pausa, se queda mientras el ratón esté encima (del panel o de la tarjeta) y
 * se cierra con Esc. Con teclado, Espacio sobre el panel lo abre.
 */
export function usePeek() {
  const [open, setOpen] = useState(false)
  const timer = useRef<number | null>(null)
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => clear, [])
  const enter = useCallback(() => {
    clear()
    timer.current = window.setTimeout(() => setOpen(true), PEEK_OPEN_DELAY_MS)
  }, [])
  const leave = useCallback(() => {
    clear()
    timer.current = window.setTimeout(() => setOpen(false), PEEK_CLOSE_GRACE_MS)
  }, [])
  const show = useCallback(() => { clear(); setOpen(true) }, [])
  const hide = useCallback(() => { clear(); setOpen(false) }, [])
  return { open, setOpen, enter, leave, show, hide }
}

/** Botones para lo que el panel te pide, sin desplegarlo: aprobar o denegar, o ir a responder. */
export function NeedsYouActions({ session, onAnswer }: { session: PaneSession; onAnswer: () => void }) {
  const { t } = useI18n()
  const approval = session.approvals.find((item) => item.status !== 'resolving')
  if (approval) {
    return (
      <div className="pane-needs" data-kind="approval">
        <p className="pane-needs-text"><ShieldAlert size={12} aria-hidden="true" /><span>{approval.description || approval.target || approval.capability}</span></p>
        <div className="pane-needs-actions">
          <button type="button" className="pane-needs-button is-primary" onClick={() => session.resolveApproval(approval.approval_id, 'allow_once')}>{t('approval.choice.once')}</button>
          <button type="button" className="pane-needs-button" onClick={() => session.resolveApproval(approval.approval_id, 'deny')}>{t('approval.choice.deny')}</button>
        </div>
      </div>
    )
  }
  if (session.pendingQuestions > 0) {
    return (
      <div className="pane-needs" data-kind="question">
        <p className="pane-needs-text"><CircleHelp size={12} aria-hidden="true" /><span>{t('board.column.question')}</span></p>
        <div className="pane-needs-actions">
          <button type="button" className="pane-needs-button is-primary" onClick={onAnswer}>{t('board.column.answer')}</button>
        </div>
      </div>
    )
  }
  return null
}

/**
 * Tarjeta flotante sobre un panel plegado (columna o tira): la última
 * respuesta con «Ver todo», el paso y la acción del momento, y lo que te
 * pide, resoluble ahí mismo.
 */
export function PanePeek({
  title,
  session,
  digest,
  peek,
  anchor,
  onExpand,
}: {
  title: string
  session: PaneSession
  digest: PaneDigest
  peek: ReturnType<typeof usePeek>
  anchor: ReactNode
  onExpand: () => void
}) {
  const { t } = useI18n()
  return (
    <PopoverPrimitive.Root open={peek.open} onOpenChange={peek.setOpen}>
      <PopoverPrimitive.Anchor asChild>{anchor}</PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="right"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          // El vistazo no roba el foco al abrirse con el ratón; Esc lo cierra.
          onOpenAutoFocus={(event) => event.preventDefault()}
          onPointerEnter={peek.show}
          onPointerLeave={peek.leave}
          aria-label={t('board.peek.label', { title })}
          className="pane-peek r-pop z-50"
          data-testid="pane-peek"
        >
          <p className="pane-peek-title">{title}</p>
          {(digest.steps?.current || digest.action) && (
            <p className="pane-peek-now">
              {digest.steps?.current && <span>{digest.steps.current} · {t('board.column.step', { n: digest.steps.index + 1, total: digest.steps.total })}</span>}
              {digest.action && <span className="pane-peek-action">{digest.action}</span>}
            </p>
          )}
          <NeedsYouActions session={session} onAnswer={() => { peek.hide(); onExpand() }} />
          <div className="pane-peek-response">
            {digest.lastResponse ? <p>{digest.lastResponse}</p> : <p className="pane-peek-empty">{t('board.peek.noResponse')}</p>}
          </div>
          <button type="button" className="pane-peek-all" onClick={() => { peek.hide(); onExpand() }}>{t('board.peek.seeAll')}</button>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

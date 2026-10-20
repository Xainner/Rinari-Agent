import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { Check, Copy, ExternalLink, LoaderCircle, RotateCcw } from 'lucide-react'
import { commandMessage, engineApi, isCommandError, type McpAuthError, type McpAuthStart } from '../../services/engine'
import { hasTranslation, useI18n, type I18nKey } from '../../i18n'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { ProgressBar } from '../../components/ui/progress-bar'
import { platform } from '../../platform'
import { RinariAvatar } from '../rinari/RinariAvatar'
import { useConnectorEvents, type AuthStage } from './connectorStore'

/** Quién pide iniciar sesión: la tarjeta, el detalle o el alta desde el catálogo. */
export const useSignIn = create<{ name: string | null; label: string | null; open: (name: string, label?: string) => void; close: () => void }>((set) => ({
  name: null,
  label: null,
  open: (name, label) => set({ name, label: label ?? name }),
  close: () => set({ name: null, label: null }),
}))

const STAGES: readonly AuthStage[] = ['discovering', 'registering', 'waiting_for_browser', 'exchanging_code']

type Phase =
  | { kind: 'starting' }
  | { kind: 'waiting'; start: McpAuthStart }
  | { kind: 'signed_in' }
  | { kind: 'failed'; text: string; detail?: string }
  | { kind: 'timed_out' }

/** El texto llano de un error de inicio de sesión; el mensaje del Engine queda en «Detalles». */
export function authErrorText(t: (key: I18nKey) => string, error: { code?: string; hint?: string } | null | undefined): string {
  const hint = error?.hint ? `connectors.authHint.${error.hint}` : ''
  if (hint && hasTranslation(hint)) return t(hint)
  const code = error?.code ? `connectors.authError.${error.code}` : ''
  if (code && hasTranslation(code)) return t(code)
  return t('connectors.authError.unknown')
}

function startError(t: (key: I18nKey) => string, err: unknown): { text: string; detail?: string } {
  if (isCommandError(err)) {
    const details = (err.details ?? {}) as { code?: string; hint?: string; message?: string }
    const error = { code: details.code ?? err.code, hint: details.hint }
    return { text: authErrorText(t, error), detail: details.message ?? err.message }
  }
  return { text: t('connectors.authError.unknown'), detail: commandMessage(err) }
}

/**
 * Iniciar sesión con OAuth: Rinari abre el navegador predeterminado (no el de
 * la app: ahí están tus sesiones, y Google y otros bloquean los embebidos) y
 * espera la vuelta. Cada etapa sale de `mcp.auth.progress`; el final, de
 * `mcp.auth.finished`. «Sesión iniciada» no es «conectado»: eso lo dice el
 * estado del servidor después.
 */
export function SignInDialog() {
  const { t } = useI18n()
  const name = useSignIn((state) => state.name)
  const label = useSignIn((state) => state.label)
  const close = useSignIn((state) => state.close)
  const flow = useConnectorEvents((state) => (name ? state.auth[name] : undefined))
  const startFlow = useConnectorEvents((state) => state.startFlow)
  const [phase, setPhase] = useState<Phase>({ kind: 'starting' })
  const [attempt, setAttempt] = useState(0)
  const [copied, setCopied] = useState(false)
  const flowId = phase.kind === 'waiting' ? phase.start.flow_id : null
  const pending = useRef<string | null>(null)

  useEffect(() => {
    if (!name) return
    let alive = true
    setPhase({ kind: 'starting' })
    setCopied(false)
    engineApi.mcpAuthStart(name).then((start) => {
      if (!alive) return
      pending.current = start.flow_id
      startFlow(name, start.flow_id)
      setPhase({ kind: 'waiting', start })
    }).catch((err) => {
      if (alive) setPhase({ kind: 'failed', ...startError(t, err) })
    })
    return () => { alive = false }
  }, [name, attempt])

  // El final llega como evento del flujo que esta ventana empezó.
  useEffect(() => {
    if (!flow || !flowId || flow.flowId !== flowId || !flow.outcome) return
    pending.current = null
    if (flow.outcome === 'signed_in') setPhase({ kind: 'signed_in' })
    else if (flow.outcome === 'timed_out') setPhase({ kind: 'timed_out' })
    else if (flow.outcome === 'cancelled') close()
    else setPhase({ kind: 'failed', text: authErrorText(t, flow.error as McpAuthError | undefined), detail: flow.error?.message })
  }, [flow, flowId])

  function dismiss() {
    // Cerrar mientras espera el navegador cancela ese inicio de sesión: no queda nada a medias.
    if (name && pending.current) void engineApi.mcpAuthCancel(name).catch(() => undefined)
    pending.current = null
    close()
  }

  const stage = flow && flowId && flow.flowId === flowId ? flow.stage : null
  const currentStage = phase.kind === 'starting' ? null : stage ?? 'waiting_for_browser'

  return (
    <Dialog open={name !== null} onOpenChange={(open) => { if (!open) dismiss() }}>
      <DialogContent className="max-w-md" data-testid="connector-signin" data-phase={phase.kind}>
        <DialogHeader>
          <DialogTitle>{t('connectors.signin.title', { name: label ?? name ?? '' })}</DialogTitle>
          <DialogDescription>{t('connectors.signin.intro')}</DialogDescription>
        </DialogHeader>

        {(phase.kind === 'starting' || phase.kind === 'waiting') && (
          <div className="space-y-3" role="status" aria-live="polite">
            <ProgressBar label={t('connectors.signin.progress')} />
            <ol className="connector-steps">
              {STAGES.map((item) => {
                const index = STAGES.indexOf(item)
                const at = currentStage ? STAGES.indexOf(currentStage) : -1
                const state = at > index ? 'done' : at === index ? 'current' : 'pending'
                return (
                  <li key={item} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
                    <span className="connector-step-mark" aria-hidden="true">{state === 'done' ? <Check size={11} /> : state === 'current' ? <LoaderCircle size={11} className="r-spin" /> : null}</span>
                    <span>{t(`connectors.signin.stage.${item}` as I18nKey)}</span>
                    <span className="sr-only">{t(`connectors.signin.stepState.${state}` as I18nKey)}</span>
                  </li>
                )
              })}
            </ol>
            {phase.kind === 'waiting' && (
              <>
                <p className="text-[13px] text-[var(--text)]">{t(phase.start.browser_opened ? 'connectors.signin.browserOpened' : 'connectors.signin.browserNotOpened')}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => void platform().opener.openUrl(phase.start.authorize_url).catch(() => undefined)}><ExternalLink size={13} /> {t('connectors.signin.openAgain')}</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void platform().clipboard.writeText(phase.start.authorize_url).then(() => setCopied(true)).catch(() => undefined)}>{copied ? <Check size={13} /> : <Copy size={13} />} {t(copied ? 'connectors.signin.copied' : 'connectors.signin.copyLink')}</button>
                </div>
              </>
            )}
            <div className="flex justify-end">
              <button type="button" className="btn btn-quiet" onClick={dismiss}>{t('connectors.signin.cancel')}</button>
            </div>
          </div>
        )}

        {phase.kind === 'signed_in' && (
          <div className="mcp-result is-ok" role="status">
            <RinariAvatar state="done" size={34} />
            <div className="min-w-0">
              <p className="font-semibold text-[var(--success)]">{t('connectors.signin.done')}</p>
              <p className="mt-0.5 text-[12.5px] text-[var(--text-muted)]">{t('connectors.signin.doneHint')}</p>
            </div>
          </div>
        )}

        {(phase.kind === 'failed' || phase.kind === 'timed_out') && (
          <div className="mcp-result is-error" role="alert">
            <RinariAvatar state="error" size={34} />
            <div className="min-w-0">
              <p className="font-semibold text-[var(--danger)]">{t(phase.kind === 'timed_out' ? 'connectors.signin.timedOut' : 'connectors.signin.failed')}</p>
              {phase.kind === 'failed' && <p className="mt-1 text-[12.5px] text-[var(--text)]">{phase.text}</p>}
              {phase.kind === 'failed' && phase.detail && <details className="mt-1 text-[11.5px] text-[var(--text-subtle)]"><summary className="cursor-pointer">{t('mcp.result.details')}</summary><p className="mt-1 break-words font-mono">{phase.detail}</p></details>}
            </div>
          </div>
        )}

        {phase.kind !== 'starting' && phase.kind !== 'waiting' && (
          <div className="flex justify-end gap-2">
            {phase.kind !== 'signed_in' && <button type="button" className="btn btn-secondary" onClick={() => setAttempt((value) => value + 1)}><RotateCcw size={14} /> {t('connectors.signin.retry')}</button>}
            <button type="button" className="btn btn-primary" onClick={close}>{t(phase.kind === 'signed_in' ? 'connectors.signin.close' : 'common.close')}</button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

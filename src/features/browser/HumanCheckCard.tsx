import { useState } from 'react'
import { AppWindow, Check, ExternalLink, Globe, LoaderCircle, ShieldQuestion } from 'lucide-react'
import { toast } from 'sonner'

import { useI18n } from '../../i18n'
import { platform } from '../../platform'
import { commandMessage, engineApi } from '../../services/engine'
import type { ToolTimelineItem } from '../activity/types'
import { useExternalBrowserStore } from './externalBrowserStore'

export interface HumanCheck {
  check: string
  url: string
}

/**
 * La página pide una verificación humana (Turnstile, hCaptcha, reCAPTCHA) y la
 * herramienta del navegador lo dijo con `HUMAN_CHECK` (plan 0.4.0 #45).
 */
export function humanCheckOf(item: ToolTimelineItem): HumanCheck | null {
  const data = item.presentation?.data
  if (!data || typeof data !== 'object') return null
  const fields = data as { browser_error?: unknown; check?: unknown; url?: unknown }
  if (fields.browser_error !== 'HUMAN_CHECK') return null
  return {
    check: typeof fields.check === 'string' ? fields.check : '',
    url: typeof fields.url === 'string' ? fields.url : '',
  }
}

/**
 * «Este sitio verifica que seas una persona». Rinari no lo resuelve ni lo
 * esquiva: ofrece abrirlo en tu navegador, o en un Chrome/Edge de verdad con
 * el perfil de Rinari del proyecto, donde pasas la verificación tú y Rinari
 * sigue después.
 */
export function HumanCheckCard({ sessionId, check }: { sessionId: string | null; check: HumanCheck }) {
  const { t } = useI18n()
  const external = useExternalBrowserStore((state) => (sessionId ? state.bySession[sessionId] : undefined))
  const [asked, setAsked] = useState(false)
  const web = /^https?:\/\//i.test(check.url)
  const opening = asked && (!external || external.state === 'opening')

  async function openInRinariChrome() {
    if (!sessionId) return
    setAsked(true)
    useExternalBrowserStore.getState().set(sessionId, { state: 'opening', url: check.url })
    try {
      await engineApi.browserExternalOpen(sessionId, check.url)
    } catch (error) {
      setAsked(false)
      useExternalBrowserStore.getState().set(sessionId, { state: 'failed', error: commandMessage(error) })
      toast.error(commandMessage(error))
    }
  }

  const opened = external?.state === 'open'
  return (
    // De la familia de las tarjetas que esperan a la persona (como un permiso):
    // tu turno mientras no lo abras; después queda en calma.
    <div className="approval-card human-check-card my-2 text-[13px]" data-testid="human-check-card" data-check={check.check} data-state={opened ? 'settled' : 'open'}>
      <div className="flex items-start gap-3 text-[var(--text)]">
        <span className="approval-icon"><ShieldQuestion size={17} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[15px] font-bold tracking-[-0.01em]">{t('browser.humanCheck.title')}</div>
          {!opened && <p className="human-check-body mt-0.5 text-[13px] leading-relaxed text-[var(--text-muted)]">{t('browser.humanCheck.body')}</p>}
        </div>
        {!opened && <span className="approval-badge">{t('browser.humanCheck.badge')}</span>}
      </div>
      {(check.url || check.check) && (
        <div className="human-check-url mt-2 flex min-w-0 items-center gap-2 text-[12px] text-[var(--text-subtle)]">
          {check.url && <><Globe size={12} aria-hidden="true" className="shrink-0" /><span className="min-w-0 truncate font-mono text-[11px]" title={check.url}>{check.url}</span></>}
          {check.check && <span className="r-chip shrink-0">{check.check}</span>}
        </div>
      )}
      {web && (
        <div className="human-check-actions mt-3.5 flex flex-wrap gap-2">
          {sessionId && (
            <button
              type="button"
              className={opened ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'}
              data-testid="human-check-open-chrome"
              disabled={opening || opened}
              onClick={() => void openInRinariChrome()}
            >
              {opening ? <LoaderCircle size={13} className="animate-spin" aria-hidden="true" /> : opened ? <Check size={13} aria-hidden="true" /> : <AppWindow size={13} aria-hidden="true" />}
              {opening
                ? t('browser.humanCheck.opening')
                : opened
                  ? t('browser.humanCheck.opened')
                  : t('browser.humanCheck.openChrome')}
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            data-testid="human-check-open-mine"
            onClick={() => void platform().opener.openUrl(check.url).catch((error) => toast.error(commandMessage(error)))}
          >
            <ExternalLink size={13} aria-hidden="true" />
            {t('browser.humanCheck.openMine')}
          </button>
        </div>
      )}
      {opened && <p className="human-check-note act-notice mt-2.5"><span className="act-notice-icon"><Check size={12} aria-hidden="true" /></span><span className="min-w-0">{t('browser.humanCheck.openedNote')}</span></p>}
    </div>
  )
}

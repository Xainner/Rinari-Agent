import { useState } from 'react'
import { ExternalLink, ShieldQuestion } from 'lucide-react'
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

  return (
    <div className="human-check-card my-2 rounded-xl border border-[var(--warning)]/35 bg-[var(--warning)]/5 p-3 text-[13px]" data-testid="human-check-card" data-check={check.check}>
      <div className="human-check-head flex items-center gap-2 font-semibold text-[var(--text)]">
        <ShieldQuestion size={15} aria-hidden="true" />
        <span>{t('browser.humanCheck.title')}</span>
      </div>
      <p className="human-check-body mt-1 text-[12px] text-[var(--text-muted)]">{t('browser.humanCheck.body')}</p>
      {check.url && <p className="human-check-url mt-1 truncate font-mono text-[11px] text-[var(--text-subtle)]" title={check.url}>{check.url}</p>}
      {web && (
        <div className="human-check-actions mt-2.5 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            data-testid="human-check-open-mine"
            onClick={() => void platform().opener.openUrl(check.url).catch((error) => toast.error(String(error)))}
          >
            <ExternalLink size={13} aria-hidden="true" />
            {t('browser.humanCheck.openMine')}
          </button>
          {sessionId && (
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              data-testid="human-check-open-chrome"
              disabled={opening || external?.state === 'open'}
              onClick={() => void openInRinariChrome()}
            >
              {opening
                ? t('browser.humanCheck.opening')
                : external?.state === 'open'
                  ? t('browser.humanCheck.opened')
                  : t('browser.humanCheck.openChrome')}
            </button>
          )}
        </div>
      )}
      {external?.state === 'open' && <p className="human-check-note mt-2 text-[12px] text-[var(--text-muted)]">{t('browser.humanCheck.openedNote')}</p>}
    </div>
  )
}

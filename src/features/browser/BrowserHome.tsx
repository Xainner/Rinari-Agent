import { useEffect, useRef, useState } from 'react'
import { Eraser, Globe, Pin, Search } from 'lucide-react'

import { useConfirm } from '../../components/ui/useConfirm'
import { useI18n } from '../../i18n'
import { platform } from '../../platform'
import { desktopApi } from '../../services/desktop'
import { addressToUrl, SEARCH_ENGINES, useBrowserPrefs, type BrowserPlace } from '../../stores/browserPrefs'
import { RinariAvatar } from '../rinari/RinariAvatar'

export interface RunningPage {
  url: string
  label: string
  kind: string
}

export interface BrowserHomeProps {
  sessionId: string
  /** Proyecto de la conversación, o la clave de las conversaciones sin proyecto. */
  projectKey: string
  /** A loose chat's recents are its own: «Recientes en esta conversación». */
  scope?: 'project' | 'chat'
  /** Hay un turno en marcha: Rinari puede abrir una página en cualquier momento. */
  busy?: boolean
  /** Sube cuando hay que llevar el foco a la dirección (Ctrl+L). */
  focusAddress?: number
  onOpen: (url: string) => void
}

/** El dominio, para nombrar un sitio sin título y para su inicial. */
function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function PlaceTile({ place, onOpen, testId }: { place: BrowserPlace | RunningPage; onOpen: (url: string) => void; testId: string }) {
  const host = hostOf(place.url)
  const title = 'title' in place ? place.title || host : place.label
  const live = 'kind' in place
  return (
    <button
      type="button"
      className="browser-home-tile"
      data-testid={testId}
      title={place.url}
      onClick={() => onOpen(place.url)}
    >
      <span className="browser-home-tile-icon" aria-hidden="true" data-live={live || undefined}>
        {host.replace(/^www\./, '').charAt(0).toUpperCase() || '·'}
      </span>
      <span className="browser-home-tile-text">
        <span className="browser-home-tile-title">{title}</span>
        <span className="browser-home-tile-host">{host}</span>
      </span>
    </button>
  )
}

/**
 * La página de inicio del navegador de Rinari (plan 0.4.0 #46), en lugar de
 * «Preparando el navegador…» y de una página en blanco: una barra para abrir
 * una dirección o buscar, lo que está en marcha en el proyecto (sus vistas
 * previas), lo reciente y lo fijado. Es de la app, no una página web: no
 * carga nada de internet por sí sola.
 */
export default function BrowserHome({ sessionId, projectKey, scope = 'project', busy = false, focusAddress = 0, onOpen }: BrowserHomeProps) {
  const { t } = useI18n()
  const { ask, dialog } = useConfirm()
  const [cleared, setCleared] = useState<'idle' | 'done' | 'failed'>('idle')
  const engine = useBrowserPrefs((state) => state.engine)
  const recent = useBrowserPrefs((state) => state.recent[projectKey]) ?? []
  const pinned = useBrowserPrefs((state) => state.pinned[projectKey]) ?? []
  const [text, setText] = useState('')
  const [running, setRunning] = useState<RunningPage[]>([])
  const input = useRef<HTMLInputElement | null>(null)
  const root = useRef<HTMLDivElement | null>(null)

  // «En marcha»: las vistas previas de este proyecto que están corriendo.
  useEffect(() => {
    let alive = true
    void desktopApi
      .listPreviews(sessionId)
      .then((result) => {
        if (!alive) return
        setRunning(
          (result.previews ?? []).map((preview) => ({
            url: preview.url,
            label: preview.label || hostOf(preview.url),
            kind: preview.kind,
          })),
        )
      })
      .catch(() => {
        // Un Engine sin la lista: la sección no aparece.
      })
    return () => {
      alive = false
    }
  }, [sessionId])

  // Ctrl+L lleva a la barra, como en cualquier navegador.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'l') return
      const node = root.current
      if (!node || node.offsetParent === null) return
      const pane = (document.activeElement as HTMLElement | null)?.closest('[data-session-id]')
      if (pane && pane.getAttribute('data-session-id') !== sessionId) return
      event.preventDefault()
      input.current?.focus()
      input.current?.select()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sessionId])

  useEffect(() => {
    if (focusAddress === 0) return
    input.current?.focus()
    input.current?.select()
  }, [focusAddress])

  const open = (url: string) => {
    if (url) onOpen(url)
  }

  /**
   * El perfil del navegador es uno para todas las conversaciones: borrarlo
   * cierra las sesiones iniciadas en todos los sitios, aquí y en las demás.
   */
  const clearData = async () => {
    const ok = await ask({
      title: t('browser.clearData.title'),
      body: t('browser.clearData.body'),
      confirmLabel: t('browser.clearData.confirm'),
      cancelLabel: t('common.cancel'),
    })
    if (!ok) return
    try {
      await platform().browser.clearData()
      setCleared('done')
    } catch {
      setCleared('failed')
    }
  }

  return (
    <div ref={root} className="browser-home" data-testid="browser-home">
      <form
        className="browser-home-search"
        onSubmit={(event) => {
          event.preventDefault()
          open(addressToUrl(text, engine))
        }}
      >
        <Search size={15} aria-hidden="true" />
        <input
          ref={input}
          aria-label={t('browser.home.address')}
          data-testid="browser-home-address"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('browser.home.placeholder', { engine: SEARCH_ENGINES[engine].label })}
          spellCheck={false}
        />
      </form>

      {running.length > 0 && (
        <section className="browser-home-section" aria-label={t('browser.home.running')}>
          <h3>{t('browser.home.running')}</h3>
          <div className="browser-home-grid">
            {running.map((page) => <PlaceTile key={page.url} place={page} onOpen={open} testId="browser-home-running" />)}
          </div>
        </section>
      )}

      {pinned.length > 0 && (
        <section className="browser-home-section" aria-label={t('browser.home.pinned')}>
          <h3><Pin size={12} aria-hidden="true" /> {t('browser.home.pinned')}</h3>
          <div className="browser-home-grid">
            {pinned.map((place) => <PlaceTile key={place.url} place={place} onOpen={open} testId="browser-home-pinned" />)}
          </div>
        </section>
      )}

      <section className="browser-home-section" aria-label={t(scope === 'chat' ? 'browser.home.recentChat' : 'browser.home.recent')}>
        <h3>{t(scope === 'chat' ? 'browser.home.recentChat' : 'browser.home.recent')}</h3>
        {recent.length > 0 ? (
          <div className="browser-home-grid">
            {recent.map((place) => <PlaceTile key={place.url} place={place} onOpen={open} testId="browser-home-recent" />)}
          </div>
        ) : (
          <p className="browser-home-empty"><Globe size={13} aria-hidden="true" /> {t('browser.home.noRecent')}</p>
        )}
      </section>

      <footer className="browser-home-status">
        <RinariAvatar state={busy ? 'working' : 'idle'} size={26} />
        <span role="status">{busy ? t('browser.home.busy') : t('browser.ready')}</span>
        <span className="browser-home-profile">
          {cleared !== 'idle' && (
            <span role="status" data-tone={cleared === 'failed' ? 'danger' : undefined}>
              {t(cleared === 'done' ? 'browser.clearData.done' : 'browser.clearData.failed')}
            </span>
          )}
          <button type="button" className="btn btn-ghost btn-sm" data-testid="browser-clear-data" title={t('browser.clearData.hint')} onClick={() => void clearData()}>
            <Eraser size={13} aria-hidden="true" /> {t('browser.clearData.action')}
          </button>
        </span>
      </footer>
      {dialog}
    </div>
  )
}

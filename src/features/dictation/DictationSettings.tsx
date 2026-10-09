import { useCallback, useEffect, useState } from 'react'
import { Download, Mic, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Switch } from '../../components/ui/switch'
import { useI18n, type I18nKey } from '../../i18n'
import { commandMessage, engineApi, onEngineEvent, type SpeechStatus } from '../../services/engine'
import { useDictationPrefs } from './dictationPrefs'

export function formatSize(bytes: number): string {
  return bytes >= 1_000_000_000 ? `${(bytes / 1_000_000_000).toFixed(1)} GB` : `${Math.round(bytes / 1_000_000)} MB`
}

/** Progreso de las descargas de modelos, por id, a partir de `speech.model.*`. */
export function useSpeechModelEvents(onReady: () => void) {
  const [progress, setProgress] = useState<Record<string, number>>({})
  useEffect(() => {
    let disposed = false
    let stop: (() => void) | undefined
    // No desktop bridge (tests, a page outside the app): no progress to show.
    const subscribe = (listener: Parameters<typeof onEngineEvent>[0]) => {
      try {
        return onEngineEvent(listener)
      } catch {
        return Promise.reject(new Error('no bridge'))
      }
    }
    void subscribe(({ event, payload }) => {
      const model = typeof payload.model === 'string' ? payload.model : ''
      if (!model) return
      if (event === 'speech.model.progress') {
        const total = Number(payload.total) || 1
        setProgress((current) => ({ ...current, [model]: Math.min(1, Number(payload.received) / total) }))
      } else if (event === 'speech.model.ready' || event === 'speech.model.failed') {
        setProgress((current) => {
          const next = { ...current }
          delete next[model]
          return next
        })
        if (event === 'speech.model.failed') {
          const error = (payload.error ?? {}) as { message?: string }
          toast.error(error.message ?? 'download failed')
        }
        onReady()
      }
    }).then((unsubscribe) => {
      if (disposed) unsubscribe()
      else stop = unsubscribe
    }).catch(() => {})
    return () => {
      disposed = true
      stop?.()
    }
  }, [onReady])
  return progress
}

/**
 * Ajustes › Dictado. El modelo, el idioma y el vocabulario los guarda el
 * Engine; «enviar al terminar» es del escritorio y está apagado por defecto.
 */
export default function DictationSettings() {
  const { t } = useI18n()
  const [status, setStatus] = useState<SpeechStatus | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [vocabulary, setVocabulary] = useState('')
  const sendOnFinish = useDictationPrefs((s) => s.sendOnFinish)
  const setSendOnFinish = useDictationPrefs((s) => s.setSendOnFinish)

  const load = useCallback(async () => {
    try {
      const next = await engineApi.speechStatus()
      setStatus(next)
      setVocabulary(next.vocabulary)
    } catch {
      setUnavailable(true)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  const progress = useSpeechModelEvents(load)

  async function save(input: { model?: string; language?: string; vocabulary?: string }) {
    try {
      setStatus(await engineApi.speechSettingsSet(input))
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  async function download(model: string) {
    try {
      setStatus((current) => (current ? { ...current, downloading: [...(current.downloading ?? []), model] } : current))
      await engineApi.speechModelDownload(model)
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  async function remove(model: string) {
    try {
      setStatus((await engineApi.speechModelRemove(model)).status)
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  const card = 'settings-card p-4'
  if (unavailable) {
    return <p className="text-sm text-[var(--text-muted)]">{t('dictation.unavailable')}</p>
  }
  if (!status) return null
  const downloading = new Set([...(status.downloading ?? []), ...Object.keys(progress)])

  return (
    <section className="space-y-4" data-testid="dictation-settings">
      <div>
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-[var(--text)]">
          <Mic size={17} aria-hidden="true" /> {t('settings.nav.dictation')}
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{t('dictation.desc')}</p>
      </div>

      {!status.binary_found && <p role="status" className="text-sm text-[var(--warning)]">{t('dictation.noBinary')}</p>}

      <div className={card}>
        <h3 className="text-sm font-semibold text-[var(--text)]">{t('dictation.model')}</h3>
        <p className="mt-1 text-xs text-[var(--text-subtle)]">{t('dictation.modelDesc')}</p>
        <ul className="mt-3 space-y-2" role="radiogroup" aria-label={t('dictation.model')}>
          {status.models.map((model) => {
            const active = status.model === model.id
            const share = progress[model.id]
            return (
              <li key={model.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2">
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => void save({ model: model.id })}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className={`size-3.5 shrink-0 rounded-full border ${active ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--border-strong)]'}`} aria-hidden="true" />
                  <span className="text-sm font-medium text-[var(--text)]">{model.id}</span>
                  <span className="text-xs text-[var(--text-subtle)]">{formatSize(model.size)} · {t(`dictation.tier.${model.tier}` as I18nKey)}</span>
                </button>
                {model.installed ? (
                  <>
                    <span className="text-xs text-[var(--success)]">{t('dictation.installed')}</span>
                    <button type="button" aria-label={t('dictation.remove', { model: model.id })} onClick={() => void remove(model.id)} className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--danger)]">
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  </>
                ) : downloading.has(model.id) ? (
                  <span className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <progress value={share ?? 0} max={1} aria-label={t('dictation.downloading', { model: model.id })} className="h-1.5 w-24" />
                    {share !== undefined ? `${Math.round(share * 100)}%` : t('dictation.starting')}
                    <button type="button" aria-label={t('dictation.cancelDownload')} onClick={() => void engineApi.speechModelCancel(model.id)} className="rounded p-0.5 hover:bg-[var(--bg-hover)]">
                      <X size={12} aria-hidden="true" />
                    </button>
                  </span>
                ) : (
                  <button type="button" onClick={() => void download(model.id)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-semibold hover:bg-[var(--bg-hover)]">
                    <Download size={12} aria-hidden="true" /> {t('dictation.download')}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      <div className={card}>
        <label className="block text-sm font-semibold text-[var(--text)]" htmlFor="dictation-language">{t('dictation.language')}</label>
        <select
          id="dictation-language"
          value={status.language}
          onChange={(event) => void save({ language: event.target.value })}
          className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-sm text-[var(--text)]"
        >
          <option value="">{t('dictation.languageApp')}</option>
          {status.languages.map((code) => (
            <option key={code} value={code}>{code === 'auto' ? t('dictation.languageAuto') : code}</option>
          ))}
        </select>
        <label className="mt-4 block text-sm font-semibold text-[var(--text)]" htmlFor="dictation-vocabulary">{t('dictation.vocabulary')}</label>
        <p className="mt-1 text-xs text-[var(--text-subtle)]">{t('dictation.vocabularyDesc')}</p>
        <input
          id="dictation-vocabulary"
          value={vocabulary}
          maxLength={300}
          onChange={(event) => setVocabulary(event.target.value)}
          onBlur={() => { if (vocabulary !== status.vocabulary) void save({ vocabulary }) }}
          placeholder={t('dictation.vocabularyPlaceholder')}
          className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-sm text-[var(--text)]"
        />
      </div>

      <label className={`${card} flex items-center justify-between gap-4`}>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-[var(--text)]">{t('dictation.sendOnFinish')}</span>
          <span className="mt-0.5 block text-xs text-[var(--text-subtle)]">{t('dictation.sendOnFinishDesc')}</span>
        </span>
        <Switch checked={sendOnFinish} onCheckedChange={setSendOnFinish} aria-label={t('dictation.sendOnFinish')} />
      </label>

      <p className="text-xs text-[var(--text-subtle)]">{t('dictation.privacy')}</p>
    </section>
  )
}

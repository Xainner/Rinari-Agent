import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { Download, LoaderCircle, Mic, Square } from 'lucide-react'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover'
import { useI18n, type I18nKey } from '../../i18n'
import { commandMessage, engineApi, type SpeechStatus } from '../../services/engine'
import { useUIStore } from '../../stores/ui'
import { formatSize, useSpeechModelEvents } from './DictationSettings'
import { useDictation } from './useDictation'

const ERROR_KEYS: Record<string, I18nKey> = {
  MIC_DENIED: 'dictation.error.micDenied',
  MIC_MISSING: 'dictation.error.micMissing',
  EMPTY: 'dictation.error.empty',
  TOO_LONG: 'dictation.error.tooLong',
  TIMEOUT: 'dictation.error.timeout',
  NOT_INSTALLED: 'dictation.noBinary',
  MODEL_MISSING: 'dictation.error.modelMissing',
}

/**
 * Micrófono del composer. Clic para empezar y clic para terminar, o mantener
 * Ctrl+Espacio en el texto. Lo dicho se inserta en el cursor; el composer
 * decide si se envía (ajuste «enviar al terminar», apagado por defecto).
 */
export default function DictationButton({
  textareaRef,
  disabled,
  onText,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  disabled?: boolean
  onText: (text: string) => void
}) {
  const { t, lang } = useI18n()
  const goSettings = useUIStore((s) => s.goSettings)
  const [status, setStatus] = useState<SpeechStatus | null>(null)
  const [setupOpen, setSetupOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const refresh = useCallback(async () => {
    try {
      const next = await engineApi.speechStatus()
      setStatus(next)
      return next
    } catch {
      setStatus(null)
      return null
    }
  }, [])
  const progress = useSpeechModelEvents(refresh)

  const dictation = useDictation({
    language: status?.language || lang,
    onText,
    onError: (code) => toast.error(ERROR_KEYS[code] ? t(ERROR_KEYS[code]) : t('dictation.error.generic')),
  })

  /** Only start when the Engine can transcribe; otherwise say what is missing. */
  const begin = useCallback(async () => {
    const current = status?.ready ? status : await refresh()
    if (!current?.ready) {
      setSetupOpen(true)
      return
    }
    void dictation.start()
  }, [dictation, refresh, status])

  const toggle = () => {
    if (dictation.state === 'recording' || dictation.state === 'starting') void dictation.stop()
    else if (dictation.state === 'idle') void begin()
  }

  // Hold Ctrl+Space in the message box to talk; release to transcribe.
  const holding = useRef(false)
  useEffect(() => {
    const box = textareaRef.current
    if (!box || disabled) return
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || !(event.ctrlKey || event.metaKey) || event.repeat) return
      event.preventDefault()
      if (holding.current) return
      holding.current = true
      void begin()
    }
    const up = (event: KeyboardEvent) => {
      if (!holding.current) return
      if (event.code === 'Space' || event.key === 'Control' || event.key === 'Meta') {
        holding.current = false
        void dictation.stop()
      }
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dictation.state === 'recording') {
        event.preventDefault()
        holding.current = false
        dictation.cancel()
      }
    }
    box.addEventListener('keydown', down)
    box.addEventListener('keydown', escape)
    window.addEventListener('keyup', up)
    return () => {
      box.removeEventListener('keydown', down)
      box.removeEventListener('keydown', escape)
      window.removeEventListener('keyup', up)
    }
  }, [begin, dictation, disabled, textareaRef])

  useEffect(() => {
    if (dictation.state !== 'recording') return
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [dictation.state])

  async function download() {
    if (!status) return
    try {
      await engineApi.speechModelDownload(status.model)
      setStatus({ ...status, downloading: [...(status.downloading ?? []), status.model] })
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  const recording = dictation.state === 'recording'
  const busy = dictation.state === 'starting' || dictation.state === 'transcribing'
  const seconds = recording && dictation.startedAt ? Math.max(0, Math.floor((now - dictation.startedAt) / 1000)) : 0
  const model = status?.models.find((m) => m.id === status.model)
  const share = status ? progress[status.model] : undefined
  const downloadingModel = Boolean(status && (share !== undefined || status.downloading?.includes(status.model)))
  const label = recording
    ? t('dictation.stop')
    : dictation.state === 'transcribing'
      ? t('dictation.transcribing')
      : t('dictation.start')

  return (
    <Popover open={setupOpen} onOpenChange={setSetupOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="dictation-button"
          data-state={dictation.state}
          disabled={disabled || dictation.state === 'transcribing'}
          aria-label={label}
          aria-pressed={recording}
          title={`${label} (Ctrl+Espacio)`}
          onClick={(event) => {
            // The popover opens only when something is missing, never on a plain click.
            event.preventDefault()
            toggle()
          }}
          className={`relative flex h-8 min-w-8 cursor-pointer items-center justify-center gap-1 rounded-full px-1.5 transition-colors disabled:opacity-40 ${recording ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]'}`}
        >
          {busy ? (
            <LoaderCircle size={15} aria-hidden="true" className="motion-safe:animate-spin" />
          ) : recording ? (
            <Square size={13} aria-hidden="true" />
          ) : (
            <Mic size={15} aria-hidden="true" />
          )}
          {recording && (
            <>
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-full border border-red-400/60"
                style={{ transform: `scale(${1 + Math.min(0.35, dictation.level * 3)})` }}
              />
              <span className="text-[11px] tabular-nums">{`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</span>
            </>
          )}
          <span className="sr-only" aria-live="polite">{recording ? t('dictation.listening') : dictation.state === 'transcribing' ? t('dictation.transcribing') : ''}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-2 p-3 text-sm" data-testid="dictation-setup">
        {!status ? (
          <p className="text-[var(--text-muted)]">{t('dictation.unavailable')}</p>
        ) : !status.binary_found ? (
          <p className="text-[var(--text-muted)]">{t('dictation.noBinary')}</p>
        ) : (
          <>
            <p className="font-medium text-[var(--text)]">{t('dictation.setupTitle')}</p>
            <p className="text-xs text-[var(--text-muted)]">
              {t('dictation.setupBody', { model: status.model, size: model ? formatSize(model.size) : '' })}
            </p>
            {downloadingModel ? (
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <progress value={share ?? 0} max={1} aria-label={t('dictation.downloading', { model: status.model })} className="h-1.5 flex-1" />
                {share !== undefined ? `${Math.round(share * 100)}%` : t('dictation.starting')}
              </div>
            ) : (
              <button type="button" onClick={() => void download()} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-2.5 py-1.5 text-xs font-semibold text-white">
                <Download size={12} aria-hidden="true" /> {t('dictation.downloadSize', { size: model ? formatSize(model.size) : '' })}
              </button>
            )}
          </>
        )}
        <button type="button" onClick={() => { setSetupOpen(false); goSettings('dictation') }} className="block text-xs text-[var(--accent)] hover:underline">
          {t('dictation.openSettings')}
        </button>
      </PopoverContent>
    </Popover>
  )
}

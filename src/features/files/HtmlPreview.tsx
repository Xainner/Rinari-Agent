import { useEffect, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import {
  desktopApi,
  type FilePreview,
  type WebPreview,
} from '../../services/desktop'
import { commandMessage } from '../../services/engine'
import { CodeBlock } from '../../components/Markdown'
import { useI18n } from '../../i18n'

import { platform } from '../../platform'

export function isolatedPreviewUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === 'http:' &&
      parsed.origin !== window.location.origin &&
      /^(?:localhost|127\.0\.0\.1|\[::1\]|[a-f0-9]{32}\.localhost)$/.test(
        parsed.hostname,
      )
    )
  } catch {
    return false
  }
}

export default function HtmlPreview({
  sessionId,
  turnId,
  file,
}: {
  sessionId: string
  turnId?: string
  file: FilePreview
}) {
  const { t } = useI18n()
  const [preview, setPreview] = useState<WebPreview | null>(null)
  const [content, setContent] = useState(file.content)
  const [source, setSource] = useState(false)
  const [reload, setReload] = useState(0)
  const [error, setError] = useState('')
  const [devRequired, setDevRequired] = useState(false)
  const [isVite, setIsVite] = useState(false)
  const [existingUrl, setExistingUrl] = useState('http://localhost:5173')
  const [settings, setSettings] = useState({
    runDev: false,
    url: '',
    attempt: 0,
  })

  useEffect(() => {
    let disposed = false
    let handle: WebPreview | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let revision: number | undefined
    const started = Date.now()
    setPreview(null)
    setError('')
    setDevRequired(false)
    async function poll() {
      if (!handle || disposed) return
      try {
        const next = await desktopApi.previewStatus(
          sessionId,
          handle.preview_id,
        )
        if (disposed) return
        if (revision !== undefined && next.revision !== revision) {
          setReload((value) => value + 1)
          void desktopApi
            .readFile(sessionId, file.path, turnId)
            .then((updated) => {
              if (!disposed) setContent(updated.content)
            })
            .catch(() => {
              /* the frame displays deleted-file errors */
            })
        }
        revision = next.revision
        setPreview(next)
        setError(
          next.error ||
            (!next.ready && Date.now() - started > 30_000
              ? t('preview.serverNotResponding')
              : ''),
        )
      } catch (reason) {
        if (!disposed) {
          setError(commandMessage(reason))
          setPreview(null)
        }
        return
      }
      if (!disposed) timer = setTimeout(() => void poll(), 1000)
    }
    void desktopApi
      .startPreview(
        sessionId,
        file.path,
        turnId,
        settings.runDev,
        settings.url || undefined,
      )
      .then((next) => {
        handle = next
        if (disposed) {
          void desktopApi
            .stopPreview(sessionId, next.preview_id)
            .catch(() => {})
          return
        }
        if (!isolatedPreviewUrl(next.url)) {
          void desktopApi
            .stopPreview(sessionId, next.preview_id)
            .catch(() => {})
          handle = null
          throw new Error(t('preview.isolatedOrigin'))
        }
        revision = next.revision
        setPreview(next)
        timer = setTimeout(() => void poll(), 1000)
      })
      .catch((reason) => {
        if (disposed) return
        const message = commandMessage(reason)
        setIsVite(message.includes('PREVIEW_DEV_REQUIRED'))
        setDevRequired(
          message.includes('PREVIEW_DEV_REQUIRED') ||
            message.includes('PREVIEW_SERVER_REQUIRED'),
        )
        setError(message)
      })
    return () => {
      disposed = true
      clearTimeout(timer)
      if (handle)
        void desktopApi
          .stopPreview(sessionId, handle.preview_id)
          .catch(() => {})
    }
  }, [sessionId, turnId, file.path, settings])

  function refresh() {
    if (!preview || error)
      setSettings((current) => ({ ...current, attempt: current.attempt + 1 }))
    else setReload((value) => value + 1)
    void desktopApi
      .readFile(sessionId, file.path, turnId)
      .then((updated) => setContent(updated.content))
      .catch((reason) => setError(commandMessage(reason)))
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-[var(--border)] p-2 text-xs">
        <button
          type="button"
          aria-pressed={!source}
          onClick={() => setSource(false)}
          className={`rounded-md px-2 py-1.5 ${!source ? 'bg-[var(--bg-hover)] text-[var(--text)]' : 'text-[var(--text-muted)]'}`}
        >
          {t('files.preview')}
        </button>
        <button
          type="button"
          aria-pressed={source}
          onClick={() => setSource(true)}
          className={`rounded-md px-2 py-1.5 ${source ? 'bg-[var(--bg-hover)] text-[var(--text)]' : 'text-[var(--text-muted)]'}`}
        >
          {t('preview.code')}
        </button>
        <span className="flex-1" />
        <button
          type="button"
          title={t('preview.useDevServer')}
          onClick={() => setDevRequired((value) => !value)}
          className="rounded-md px-2 py-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
        >
          {t('preview.server')}
        </button>
        <button
          type="button"
          aria-label={t('preview.reloadPreview')}
          title={t('preview.reload')}
          onClick={refresh}
          className="rounded-md p-1.5 hover:bg-[var(--bg-hover)]"
        >
          <RefreshCw size={14} />
        </button>
        <button
          type="button"
          aria-label={t('preview.openInBrowser')}
          title={t('preview.openInBrowser')}
          disabled={!preview?.ready}
          onClick={() => {
            if (preview)
              void platform().opener.openUrl(preview.url).catch((reason) =>
                toast.error(commandMessage(reason)),
              )
          }}
          className="rounded-md p-1.5 hover:bg-[var(--bg-hover)] disabled:opacity-40"
        >
          <ExternalLink size={14} />
        </button>
      </div>
      {source && (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <CodeBlock code={content} language="html" />
        </div>
      )}
      <div className={source ? 'hidden' : 'relative min-h-0 flex-1'}>
        {preview?.ready && !error && !devRequired ? (
          <iframe
            key={`${preview.preview_id}:${reload}`}
            title={t('attach.previewOf', { name: file.name })}
            src={preview.url}
            sandbox="allow-scripts allow-same-origin allow-forms"
            referrerPolicy="no-referrer"
            allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'"
            className="h-full w-full border-0 bg-white"
          />
        ) : (
          <div className="space-y-3 p-4 text-sm">
            {devRequired ? (
              <>
                <p>
                  {isVite ? t('preview.viteHint') : t('preview.connectHint')}
                </p>
                {isVite && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setSettings({ runDev: true, url: '', attempt: 0 })
                      }
                      className="rounded-lg bg-[var(--accent)] px-3 py-2 text-white"
                    >
                      {t('preview.startDevServer')}
                    </button>
                  </>
                )}
                <label className="block text-xs">
                  {t('preview.useExisting')}
                  <input
                    aria-label={t('preview.devServerUrl')}
                    value={existingUrl}
                    onChange={(event) => setExistingUrl(event.target.value)}
                    className="mt-2 w-full rounded-md border border-[var(--border)] bg-[var(--bg-app)] p-2"
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setSettings({
                      runDev: false,
                      url: existingUrl,
                      attempt: settings.attempt + 1,
                    })
                  }
                  className="rounded-lg border border-[var(--border)] px-3 py-2"
                >
                  {t('preview.connectServer')}
                </button>
              </>
            ) : error ? (
              <>
                <p role="alert" className="break-words">
                  {error}
                </p>
                {(settings.runDev || settings.url) && (
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--border)] px-3 py-2"
                    onClick={() =>
                      setSettings({
                        runDev: false,
                        url: '',
                        attempt: settings.attempt + 1,
                      })
                    }
                  >
                    {t('preview.configureServer')}
                  </button>
                )}
              </>
            ) : (
              <p role="status">
                {preview?.kind === 'development'
                  ? t('preview.startingDevServer')
                  : t('attach.previewLoading')}
              </p>
            )}
          </div>
        )}
      </div>
      {preview && (
        <div
          className="truncate border-t border-[var(--border)] px-3 py-1.5 text-[10px] text-[var(--text-subtle)]"
          title={preview.url}
        >
          {preview.kind === 'development'
            ? t('preview.devServer')
            : t('preview.localView')}{' '}
          · {preview.ready ? t('preview.autoRefresh') : t('preview.connecting')}
        </div>
      )}
    </div>
  )
}

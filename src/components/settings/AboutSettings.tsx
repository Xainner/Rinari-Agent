import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ArrowUpRight, Bug, Check, Copy, Download, LoaderCircle, Lightbulb, RefreshCw, ScrollText } from 'lucide-react'
import { copyText } from '../../lib/clipboard'
import { useI18n } from '../../i18n'
import { platform, type UpdateState } from '../../platform'
import { engineApi, type EngineStatus } from '../../services/engine'
import { applyUpdate, checkForUpdates, downloadUpdate, onUpdateState, updateSnapshot } from '../../services/updates'
import { APP_REPOSITORY, SOUL_VERSION, bugReportUrl, diagnostics, issueUrl } from '../../services/support'
import { useConfirm } from '../ui/useConfirm'
import { Row, Section } from './parts'
import engineManifest from '../../../engine-manifest.json'

const ENGINE_REPOSITORY = `https://github.com/${engineManifest.engine_repository}`

/**
 * Settings > Acerca de: versión, actualizaciones, ayuda y enlaces.
 *
 * Con las piezas del resto de Ajustes (`Section`, `Row`) en vez de la portada
 * propia que tenía, y con el estado real del actualizador: la versión venía de
 * una constante y se quedó en 0.2.0 tras publicar la 0.2.1.
 */
export default function AboutSettings({ version }: { version: string }) {
  const { t } = useI18n()
  const { ask: confirm, dialog } = useConfirm()
  const [status, setStatus] = useState<EngineStatus | null>(null)
  const [update, setUpdate] = useState<UpdateState | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    void engineApi.status().then((result) => { if (alive) setStatus(result) }).catch(() => {})
    let stop: (() => void) | undefined
    void onUpdateState((state) => { if (alive) setUpdate(state) })
      .then((unsubscribe) => { if (alive) stop = unsubscribe; else unsubscribe() })
      .catch(() => {})
    // Al llegar desde la campana, la versión ofrecida y su fase ya están en el
    // host: se recuperan en vez de mostrar solo «Buscar actualizaciones».
    void updateSnapshot().then((state) => { if (alive) setUpdate((current) => current ?? state) }).catch(() => {})
    return () => {
      alive = false
      stop?.()
    }
  }, [])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2500)
    return () => window.clearTimeout(timer)
  }, [copied])

  const fail = (err: unknown) =>
    toast.error(t('update.failed', { detail: err instanceof Error ? err.message : String(err) }))

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    try {
      await action()
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  async function onCheck() {
    await run(async () => {
      const found = await checkForUpdates()
      if (!found) toast.success(t('update.none'))
    })
  }

  async function onApply() {
    const ok = await confirm({
      title: t('update.applyTitle'),
      body: t('update.applyDetail'),
      confirmLabel: t('update.restartAction'),
      cancelLabel: t('common.cancel'),
    })
    if (ok) await run(applyUpdate)
  }

  const open = (url: string) => void platform().opener.openUrl(url).catch(fail)

  async function onCopyDiagnostics() {
    const ok = await copyText(diagnostics(version, status))
    setCopied(ok)
    if (!ok) toast.error(t('settings.about.copyFailed'))
  }

  const phase = update?.phase ?? 'idle'
  const updateLine =
    phase === 'checking' ? t('update.checking')
    : phase === 'available' ? t('update.available', { v: update?.available_version ?? '' })
    : phase === 'downloading' ? t('update.downloading', { percent: Math.round(update?.progress?.percent ?? 0) })
    : phase === 'downloaded' || phase === 'applying' ? t('update.ready', { v: update?.available_version ?? '' })
    : phase === 'error' ? t('update.failed', { detail: update?.message ?? t('update.unknownError') })
    : t('settings.about.updatesHint')
  const updateButton =
    phase === 'available'
      ? { label: t('update.download'), icon: Download, action: () => void run(downloadUpdate) }
      : phase === 'downloaded'
        ? { label: t('update.install'), icon: RefreshCw, action: () => void onApply() }
        : { label: t('update.check'), icon: RefreshCw, action: () => void onCheck() }
  const working = busy || phase === 'checking' || phase === 'downloading' || phase === 'applying'
  const UpdateIcon = updateButton.icon

  const engineSha = engineManifest.engine_git_sha

  return (
    <div className="space-y-6">
      {dialog}
      <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
        <img src="/logo.png" alt="" width={56} height={56} className="size-14 rounded-xl" />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-bold text-[var(--text)]">
            Rinari Agent <span className="ml-1 font-mono text-sm font-medium text-[var(--text-muted)]">v{version}</span>
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]" role="status" aria-live="polite">{updateLine}</p>
        </div>
        <button
          type="button"
          disabled={working}
          onClick={updateButton.action}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {working
            ? <LoaderCircle size={15} aria-hidden="true" className="motion-safe:animate-spin" />
            : <UpdateIcon size={15} aria-hidden="true" />}
          {updateButton.label}
        </button>
      </section>

      <Section title={t('settings.about.versions')}>
        <dl className="grid gap-3 sm:grid-cols-2">
          {[
            { label: 'Rinari Agent', value: version, hint: t('settings.about.desktop') },
            {
              label: 'Rinari Engine',
              value: status?.engine_version ?? '—',
              hint: t('settings.about.engineCommit', { sha: engineSha.slice(0, 7) }),
            },
            { label: 'Engine Protocol', value: status?.protocol_version ?? '—', hint: t('settings.about.protocol') },
            { label: t('settings.about.soul'), value: SOUL_VERSION, hint: 'rinari-default' },
          ].map(({ label, value, hint }) => (
            <div key={label} className="rounded-xl border border-[var(--border)] px-4 py-3">
              <dt className="text-xs text-[var(--text-subtle)]">{label}</dt>
              <dd className="mt-1 font-mono text-base text-[var(--text)]">{value}</dd>
              <dd className="mt-0.5 text-xs text-[var(--text-muted)]">{hint}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title={t('settings.about.help')} desc={t('settings.about.helpDesc')}>
        <Row
          title={t('settings.about.reportBug')}
          desc={t('settings.about.reportBugDesc')}
          control={<LinkButton icon={Bug} label={t('settings.about.reportBugAction')} onClick={() => open(bugReportUrl(version, status, t('settings.about.issueTemplate')))} />}
        />
        <Row
          title={t('settings.about.suggest')}
          desc={t('settings.about.suggestDesc')}
          control={<LinkButton icon={Lightbulb} label={t('settings.about.suggestAction')} onClick={() => open(issueUrl('idea', `\n\n---\nRinari Agent ${version}`))} />}
        />
        <Row
          title={t('settings.about.releaseNotes')}
          desc={t('settings.about.releaseNotesDesc', { v: version })}
          control={<LinkButton icon={ScrollText} label={t('settings.about.open')} onClick={() => open(`${APP_REPOSITORY}/releases/tag/v${version}`)} />}
        />
        <Row
          title={t('settings.about.copy')}
          desc={t('settings.about.copyDesc')}
          control={
            <LinkButton
              icon={copied ? Check : Copy}
              label={t(copied ? 'settings.about.copied' : 'settings.about.copyAction')}
              onClick={() => void onCopyDiagnostics()}
            />
          }
        />
      </Section>

      <Section title={t('settings.about.project')}>
        <Row
          title={t('settings.about.appRepo')}
          desc="Xainner / Rinari-Agent"
          control={<LinkButton icon={ArrowUpRight} label="GitHub" onClick={() => open(APP_REPOSITORY)} />}
        />
        <Row
          title={t('settings.about.engineRepo')}
          desc={`${engineManifest.engine_repository.replace('/', ' / ')} · ${engineSha.slice(0, 7)}`}
          control={<LinkButton icon={ArrowUpRight} label="GitHub" onClick={() => open(`${ENGINE_REPOSITORY}/commit/${engineSha}`)} />}
        />
        <p className="text-xs text-[var(--text-subtle)]">{t('settings.about.credit')}</p>
      </Section>
    </div>
  )
}

function LinkButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Bug
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)] transition-colors hover:bg-[var(--bg-hover)]"
    >
      <Icon size={14} aria-hidden="true" />
      {label}
    </button>
  )
}

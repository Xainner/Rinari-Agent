import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ArrowUpRight, Check, Code2, Copy, Cpu, Download, GitBranch, Layers, LoaderCircle, Sparkles } from 'lucide-react'
import { copyText } from '../../lib/clipboard'
import { useI18n } from '../../i18n'
import { engineApi, type EngineStatus } from '../../services/engine'
import { checkForUpdates, downloadUpdate } from '../../services/updates'
import { platform } from '../../platform'
import './about.css'
import engineManifest from '../../../engine-manifest.json'

/** Settings > Acerca de: identidad y versiones visibles (Code/engine/protocolo). */
export default function AboutSettings({ version }: { version: string }) {
  const { t } = useI18n()
  const [status, setStatus] = useState<EngineStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [copied, setCopied] = useState(false)
  const [canExportMigration, setCanExportMigration] = useState(false)
  const [exportingMigration, setExportingMigration] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2500)
    return () => window.clearTimeout(timer)
  }, [copied])

  async function onCopyDiagnostics() {
    const ok = await copyText([
      `Rinari Agent: ${version}`,
      `Rinari Engine: ${status?.engine_version ?? 'unknown'}`,
      `Engine Protocol: ${status?.protocol_version ?? 'unknown'}`,
      `Engine state: ${status?.state ?? 'unknown'}`,
      `Engine pin: ${engineManifest.engine_git_sha}`,
      'Bundled Soul: rinari-default 3.0',
    ].join('\n'))
    setCopied(ok)
    if (!ok) toast.error(t('settings.about.copyFailed'))
  }

  useEffect(() => {
    let alive = true
    void engineApi
      .status()
      .then((result) => {
        if (alive) setStatus(result)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    void platform().migration.status().then((value) => {
      if (alive) setCanExportMigration(value.can_export === true)
    }).catch(() => undefined)
    return () => { alive = false }
  }, [])

  async function onExportMigration() {
    setExportingMigration(true)
    try {
      await platform().migration.exportForElectron()
      toast.success(t('settings.about.migrationReady'))
    } catch (error) {
      toast.error(t('settings.about.migrationFailed', {
        detail: error instanceof Error ? error.message : String(error),
      }))
    } finally {
      setExportingMigration(false)
    }
  }

  async function onCheckUpdates() {
    setChecking(true)
    try {
      const found = await checkForUpdates()
      if (!found) {
        toast.success(t('update.none'))
        return
      }
      toast(t('update.available', { v: found.version }), {
        action: {
          label: t('update.download'),
          onClick: () => {
            void downloadUpdate().catch((err: unknown) =>
              toast.error(
                t('update.failed', {
                  detail: err instanceof Error ? err.message : String(err),
                }),
              ),
            )
          },
        },
      })
    } catch (err: unknown) {
      toast.error(
        t('update.failed', {
          detail: err instanceof Error ? err.message : String(err),
        }),
      )
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="about-page">
      <section className="about-hero" aria-labelledby="about-title">
        <img className="about-character" src="/rinari-about-hero-v2.png" alt="Rinari" width={1672} height={941} />
        <div className="about-hero-content">
          <span className="about-eyebrow"><Sparkles size={13} aria-hidden="true" /> {t('settings.about.eyebrow')}</span>
          <h2 id="about-title">Rinari<span>Agent<span className="about-title-dot">.</span></span></h2>
          <p>{t('settings.about.tagline')}</p>
          <span className="about-version">v{version}</span>
        </div>
      </section>

      <div className="about-intro">
        <h3>{t('settings.about.heading')}</h3>
        <p>{t('settings.about.description')}</p>
      </div>

      <section className="about-panel" aria-labelledby="about-system-title">
        <div className="about-panel-heading">
          <h3 id="about-system-title">{t('settings.about.system')}</h3>
          <button className="about-copy" type="button" onClick={() => void onCopyDiagnostics()} aria-live="polite">
            {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {t(copied ? 'settings.about.copied' : 'settings.about.copy')}
          </button>
        </div>
        <dl className="about-version-grid">
          {[
            { icon: Layers, label: 'Rinari Agent', value: version, hint: t('settings.about.desktop') },
            { icon: Cpu, label: 'Rinari Engine', value: status?.engine_version ?? '—', hint: t('settings.about.runtime') },
            { icon: GitBranch, label: 'Engine Protocol', value: status?.protocol_version ?? '—', hint: t('settings.about.protocol') },
            { icon: Sparkles, label: t('settings.about.soul'), value: '3.0', hint: 'rinari-default' },
          ].map(({ icon: Icon, label, value, hint }) => (
            <div className="about-version-item" key={label}>
              <dt><Icon size={16} aria-hidden="true" />{label}</dt>
              <dd>{value}<span>{hint}</span></dd>
            </div>
          ))}
        </dl>
        <div className="about-build"><span>{t('settings.about.build')}</span><code title={engineManifest.engine_git_sha}>{engineManifest.engine_git_sha.slice(0, 7)}</code></div>
      </section>

      <section className="about-update" aria-labelledby="about-update-title">
        <div><h3 id="about-update-title">{t('settings.about.updates')}</h3><p>{t('settings.about.updatesHint')}</p></div>
        <button className="about-update-button" type="button" disabled={checking} onClick={() => void onCheckUpdates()}>
          {checking ? <LoaderCircle className="motion-safe:animate-spin" size={15} aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
          {checking ? t('update.checking') : t('update.check')}
        </button>
      </section>

      {canExportMigration && (
        <section className="about-update" aria-labelledby="about-migration-title">
          <div>
            <h3 id="about-migration-title">{t('settings.about.migration')}</h3>
            <p>{t('settings.about.migrationHint')}</p>
          </div>
          <button className="about-update-button" type="button" disabled={exportingMigration} onClick={() => void onExportMigration()}>
            {exportingMigration ? <LoaderCircle className="motion-safe:animate-spin" size={15} aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
            {t(exportingMigration ? 'settings.about.migrationPreparing' : 'settings.about.migrationPrepare')}
          </button>
        </section>
      )}

      <a className="about-repository" href="https://github.com/Xainner/Rinari-Agent" target="_blank" rel="noreferrer">
        <span className="about-repository-icon"><Code2 size={20} aria-hidden="true" /></span>
        <span><strong>{t('settings.about.repo')}</strong><span>Xainner / Rinari-Agent</span></span>
        <ArrowUpRight size={18} aria-hidden="true" />
      </a>
      <footer className="about-footer"><span>Rinari Agent</span><span>{t('settings.about.credit')}</span></footer>
    </div>
  )
}

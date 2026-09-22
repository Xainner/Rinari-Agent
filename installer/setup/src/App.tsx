import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  AlertTriangle, ArrowLeft, Check, ChevronRight, Download, FolderOpen, HardDrive, Minus,
  PackageCheck, RefreshCw, Settings2, ShieldCheck, Sparkles, TerminalSquare,
  Trash2, Wrench, X,
} from 'lucide-react'
import { detectLocale, translator } from './i18n'
import type { InstallOptions, Screen, SetupOperation, SetupPlan, SetupProgress, SetupStatus } from './types'

const MOCK_STATUS: SetupStatus = {
  installed: false,
  legacy_install: false,
  version: null,
  available_version: '0.2.0',
  update_available: false,
  install_dir: 'C:\\Users\\You\\AppData\\Local\\Programs\\Rinari Agent',
  scope: 'user', start_menu: true, desktop: true, cli_path: false,
  required_bytes: 412_090_368, available_bytes: 58_411_155_456, conflicting_cli: null,
}

const isTauri = () => '__TAURI_INTERNALS__' in window
const fmtBytes = (bytes: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024) + ' MB'

async function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) return invoke<T>(name, args)
  if (name === 'setup_status') return MOCK_STATUS as T
  if (name === 'choose_install_directory') return MOCK_STATUS.install_dir as T
  await new Promise((resolve) => setTimeout(resolve, 700))
  return undefined as T
}

function Titlebar({ locale, setLocale, onClose }: { locale: 'es' | 'en'; setLocale: (value: 'es' | 'en') => void; onClose: () => void }) {
  const windowAction = async (action: 'minimize' | 'toggleMaximize') => {
    if (!isTauri()) return
    await getCurrentWindow()[action]()
  }
  return <header className="titlebar" data-tauri-drag-region>
    <div className="brand" data-tauri-drag-region>
      <img src="/assets/rinari-icon.png" alt="" />
      <strong>Rinari Agent</strong><span>{translator(locale)('installer')}</span>
    </div>
    <div className="title-actions">
      <button className="locale" onClick={() => setLocale(locale === 'es' ? 'en' : 'es')} aria-label="Change language">{locale.toUpperCase()}</button>
      <button onClick={() => windowAction('minimize')} aria-label="Minimize"><Minus /></button>
      <button onClick={() => windowAction('toggleMaximize')} aria-label="Maximize"><span className="maximize" /></button>
      <button onClick={onClose} aria-label="Close"><X /></button>
    </div>
  </header>
}

function OptionRow({ checked, disabled, onChange, title, body, badge, icon }: {
  checked: boolean; disabled?: boolean; onChange?: (checked: boolean) => void; title: string; body?: string; badge?: string; icon?: React.ReactNode
}) {
  return <label className={`option-row ${disabled ? 'disabled' : ''}`}>
    <span className={`check ${checked ? 'checked' : ''}`} aria-hidden="true">{checked && <Check />}</span>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange?.(event.target.checked)} />
    {icon && <span className="option-icon">{icon}</span>}
    <span className="option-copy"><strong>{title}</strong>{body && <small>{body}</small>}</span>
    {badge && <span className="badge">{badge}</span>}
  </label>
}

function Artwork({ screen }: { screen: Screen }) {
  const file = {
    configure: 'rinari-setup.png', progress: 'rinari-installing.png', ready: 'rinari-ready.png',
    maintenance: 'rinari-maintenance.png', uninstall: 'rinari-uninstall.png', goodbye: 'rinari-goodbye.png',
  }[screen]
  return <aside className={`art art-${screen}`}>
    <div className="motto"><span>CODE</span><span>CREATE</span><span>EXPLORE</span><span>TOGETHER</span><i /></div>
    <img src={`/assets/${file}`} alt="Rinari" />
    <div className="art-glow" />
  </aside>
}

function Layout({ screen, locale, setLocale, onClose, children }: {
  screen: Screen; locale: 'es' | 'en'; setLocale: (value: 'es' | 'en') => void; onClose: () => void; children: React.ReactNode
}) {
  return <main className="shell">
    <Titlebar locale={locale} setLocale={setLocale} onClose={onClose} />
    <div className="content"><Artwork screen={screen} /><section className="panel">{children}</section></div>
  </main>
}

function Configure({ status, options, setOptions, modifying, onBack, onSubmit, t }: {
  status: SetupStatus; options: InstallOptions; setOptions: (value: InstallOptions) => void; modifying: boolean;
  onBack: () => void; onSubmit: () => void; t: ReturnType<typeof translator>
}) {
  const patch = (value: Partial<InstallOptions>) => setOptions({ ...options, ...value })
  const locationLocked = modifying || status.legacy_install
  const choose = async () => {
    const path = await command<string | null>('choose_install_directory', { current: options.install_dir })
    if (path) patch({ install_dir: path })
  }
  return <div className="panel-inner configure-screen scrollable">
    {modifying && <button className="text-back" onClick={onBack}><ArrowLeft />{t('back')}</button>}
    <p className="eyebrow">{t('configureEyebrow')}</p>
    <h1>{t('configureTitle')}</h1><p className="lead">{t('configureBody')}</p>
    <div className="divider" />
    <div className="option-list">
      <OptionRow checked disabled title={t('agent')} body={t('agentBody')} badge={t('required')} icon={<PackageCheck />} />
      <OptionRow checked={options.start_menu} onChange={(start_menu) => patch({ start_menu })} title={t('start')} />
      <OptionRow checked={options.desktop} onChange={(desktop) => patch({ desktop })} title={t('desktop')} />
      <OptionRow checked={options.cli_path} onChange={(cli_path) => patch({ cli_path })} title={t('cli')} body={t('cliBody')} icon={<TerminalSquare />} />
    </div>
    {options.cli_path && status.conflicting_cli && <div className="warning"><ShieldCheck /> <span><strong>{t('conflict')}</strong><small>{status.conflicting_cli}</small></span></div>}
    {status.legacy_install && <div className="warning migration"><ShieldCheck /> <span><strong>Rinari Code → Rinari Agent</strong><small>{t('legacyInstall')}</small></span></div>}
    <div className="scope-row">
      <button disabled={locationLocked} className={options.scope === 'user' ? 'selected' : ''} onClick={() => patch({ scope: 'user', install_dir: status.install_dir })}>{t('user')}</button>
      <button disabled={locationLocked} className={options.scope === 'machine' ? 'selected' : ''} onClick={() => patch({ scope: 'machine', install_dir: 'C:\\Program Files\\Rinari Agent' })}>{t('machine')}<small>{t('uac')}</small></button>
    </div>
    <label className="field-label">{t('folder')}</label>
    <div className="path-field"><input disabled={locationLocked} value={options.install_dir} onChange={(event) => patch({ install_dir: event.target.value })} /><button disabled={locationLocked} onClick={choose}>{t('browse')}</button></div>
    <div className="space"><HardDrive /><span>{t('requiredSpace')}: <strong>{fmtBytes(status.required_bytes)}</strong></span><span>{t('availableSpace')}: <strong>{fmtBytes(status.available_bytes)}</strong></span></div>
    <button className="primary" onClick={onSubmit}><Sparkles />{modifying ? t('modify') : t('install')}</button>
  </div>
}

function Progress({ progress, onCancel, onRetry, onBack, t }: {
  progress: SetupProgress | null; onCancel: () => void; onRetry: () => void; onBack: () => void; t: ReturnType<typeof translator>
}) {
  const value = progress?.total ? Math.round(progress.completed / progress.total * 100) : 8
  const phases = ['validate', 'stage', 'files', 'integrations', 'verify', 'commit']
  const active = Math.max(0, phases.indexOf(progress?.phase ?? 'validate'))
  const failed = progress?.phase === 'error'
  const canCancel = !['elevation', 'commit', 'integrations'].includes(progress?.phase ?? '')
  return <div className="panel-inner progress-screen">
    <p className="eyebrow">{t('progressEyebrow')}</p><h1>{failed ? t('operationFailed') : t('progressTitle')}</h1><p className="lead">{failed ? progress?.detail : t('progressBody')}</p>
    <div className={`progress-card ${failed ? 'failed' : ''}`}>
      <div className="progress-heading">{failed ? <AlertTriangle /> : <RefreshCw className="spin" />}<strong>{progress?.detail ?? t('progressBody')}</strong>{!failed && <span>{value}%</span>}</div>
      <div className="progress-track"><i style={{ width: `${value}%` }} /></div>
      <div className="phase-list">{phases.map((phase, index) => <div className={index < active ? 'done' : index === active ? 'active' : ''} key={phase}><span>{index < active ? <Check /> : index + 1}</span>{phase}</div>)}</div>
    </div>
    {failed ? <div className="button-grid progress-actions"><button className="secondary" onClick={onBack}>{t('back')}</button><button className="primary" onClick={onRetry}>{t('retry')}</button></div> : <button className="secondary" disabled={!canCancel} onClick={onCancel}>{t('cancel')}</button>}
  </div>
}

function Ready({ status, onClose, t }: { status: SetupStatus; onClose: () => void; t: ReturnType<typeof translator> }) {
  return <div className="panel-inner centered">
    <p className="eyebrow">{t('readyEyebrow')}</p><h1>{t('readyTitle')}</h1><p className="lead">{t('readyBody')}</p>
    <div className="success-card"><span><Check /></span><div><strong>Rinari Agent {status.available_version}</strong><small>{status.install_dir}</small></div></div>
    <div className="button-grid"><button className="secondary" onClick={() => command('open_install_directory')}><FolderOpen />{t('openFolder')}</button><button className="secondary" onClick={() => command('open_install_log')}>{t('viewLog')}</button></div>
    <button className="primary" onClick={() => command('launch_agent')}><Sparkles />{t('run')}</button>
    <button className="link-button" onClick={onClose}>{t('close')}</button>
  </div>
}

function Maintenance({ status, onAction, t }: { status: SetupStatus; onAction: (op: SetupOperation) => void; t: ReturnType<typeof translator> }) {
  const cards = [
    { op: 'update' as const, icon: <Download />, title: t('update'), body: status.update_available ? t('updateBody') : t('current'), disabled: !status.update_available, badge: status.update_available ? `${status.version} → ${status.available_version}` : status.version ?? '' },
    { op: 'repair' as const, icon: <Wrench />, title: t('repair'), body: t('repairBody') },
    { op: 'modify' as const, icon: <Settings2 />, title: t('modifyInstall'), body: t('modifyBody') },
    { op: 'uninstall' as const, icon: <Trash2 />, title: t('uninstall'), body: t('uninstallBody') },
  ]
  return <div className="panel-inner maintenance-screen">
    <p className="eyebrow">{t('maintenanceEyebrow')}</p><h1>{t('maintenanceTitle')}</h1><p className="lead">{t('maintenanceBody')}</p>
    <div className="maintenance-list">{cards.map((card) => <button key={card.op} disabled={card.disabled} onClick={() => onAction(card.op)}>
      <span className="maintenance-icon">{card.icon}</span><span><strong>{card.title}</strong><small>{card.body}</small></span>{card.badge && <em>{card.badge}</em>}<ChevronRight />
    </button>)}</div>
    <div className="quote">“Good tools for brighter minds.” <span>— Rinari</span></div>
  </div>
}

function Uninstall({ options, setOptions, onBack, onConfirm, t }: {
  options: InstallOptions; setOptions: (value: InstallOptions) => void; onBack: () => void; onConfirm: () => void; t: ReturnType<typeof translator>
}) {
  const patch = (value: Partial<InstallOptions>) => setOptions({ ...options, ...value })
  return <div className="panel-inner uninstall-screen scrollable">
    <p className="eyebrow">{t('uninstallEyebrow')}</p><h1>{t('uninstallTitle')}</h1><p className="lead">{t('uninstallBody2')}</p>
    <div className="option-list uninstall-options">
      <OptionRow checked disabled title={t('removeApp')} body={t('removeAppBody')} icon={<Trash2 />} />
      <OptionRow checked disabled title={t('keepData')} body={t('keepDataBody')} icon={<Settings2 />} />
      <OptionRow checked disabled title={t('keepProjects')} body={t('keepProjectsBody')} icon={<FolderOpen />} />
      <OptionRow checked={options.remove_cache} onChange={(remove_cache) => patch({ remove_cache })} title={t('removeCache')} body={t('removeCacheBody')} />
      <OptionRow checked={options.remove_shortcuts} onChange={(remove_shortcuts) => patch({ remove_shortcuts })} title={t('removeShortcuts')} body={t('removeShortcutsBody')} />
    </div>
    <div className="button-grid"><button className="secondary" onClick={onBack}>{t('back')}</button><button className="danger" onClick={onConfirm}><Trash2 />{t('confirmUninstall')}</button></div>
  </div>
}

function Goodbye({ onReinstall, onClose, t }: { onReinstall: () => void; onClose: () => void; t: ReturnType<typeof translator> }) {
  return <div className="panel-inner centered goodbye-screen">
    <p className="eyebrow">{t('goodbyeEyebrow')}</p><h1>{t('goodbyeTitle')}</h1><p className="lead">{t('goodbyeBody')}</p>
    <div className="success-card"><span><Check /></span><div><strong>{t('uninstallComplete')}</strong><small>Rinari Agent</small></div></div>
    <div className="preserved"><p><FolderOpen /><span><strong>{t('projectsSafe')}</strong></span></p><p><Settings2 /><span><strong>{t('settingsSafe')}</strong></span></p></div>
    <button className="primary" onClick={onClose}>{t('close')}</button><button className="secondary" onClick={onReinstall}>{t('reinstall')}</button>
  </div>
}

export default function App() {
  const requestedScreen = new URLSearchParams(location.search).get('screen') as Screen | null
  const [locale, setLocale] = useState<'es' | 'en'>(detectLocale())
  const t = useMemo(() => translator(locale), [locale])
  const [status, setStatus] = useState<SetupStatus>(MOCK_STATUS)
  const [screen, setScreen] = useState<Screen>(requestedScreen ?? 'configure')
  const [options, setOptions] = useState<InstallOptions>({
    install_dir: MOCK_STATUS.install_dir, scope: 'user', start_menu: true, desktop: true,
    cli_path: false, remove_cache: false, remove_shortcuts: true,
  })
  const [modifying, setModifying] = useState(false)
  const [progress, setProgress] = useState<SetupProgress | null>(null)

  useEffect(() => {
    for (const file of ['rinari-setup.png', 'rinari-installing.png', 'rinari-ready.png', 'rinari-maintenance.png', 'rinari-uninstall.png', 'rinari-goodbye.png']) {
      const image = new Image(); image.src = `/assets/${file}`
    }
    command<SetupStatus>('setup_status').then((next) => {
      const shown = requestedScreen === 'maintenance' ? { ...next, installed: true, version: '0.2.0' } : next
      setStatus(shown)
      setOptions((current) => ({ ...current, install_dir: shown.install_dir, scope: shown.scope, start_menu: shown.start_menu, desktop: shown.desktop, cli_path: shown.cli_path }))
      setScreen(requestedScreen ?? (shown.installed ? 'maintenance' : 'configure'))
    })
    if (!isTauri()) return
    let disposeProgress = () => {}
    let disposeClose = () => {}
    listen<SetupProgress>('setup-progress', (event) => setProgress(event.payload)).then((unlisten) => { disposeProgress = unlisten })
    listen('setup-close-deferred', () => {
      setProgress((current) => current ? { ...current, detail: t('cancelling') } : current)
    }).then((unlisten) => { disposeClose = unlisten })
    return () => { disposeProgress(); disposeClose() }
  }, [])

  const close = async () => {
    if (!isTauri()) return
    const state = await command<{ active: boolean; cancellable: boolean }>('setup_operation_state')
    if (state.active) {
      if (state.cancellable) {
        await command('cancel_operation')
        setProgress((current) => current ? { ...current, detail: t('cancelling') } : current)
      }
      return
    }
    await getCurrentWindow().close()
  }
  const execute = async (operation: SetupOperation) => {
    setProgress({ operation, phase: 'validate', detail: t('progressBody'), completed: 0, total: 100 })
    setScreen('progress')
    try {
      await command<void>('execute_plan', { plan: { operation, options } satisfies SetupPlan })
      const next = await command<SetupStatus>('setup_status')
      setStatus(next)
      setScreen(operation === 'uninstall' ? 'goodbye' : operation === 'modify' || operation === 'repair' ? 'maintenance' : 'ready')
    } catch (error) {
      setProgress((current) => ({ ...(current ?? { operation, completed: 0, total: 100 }), phase: 'error', detail: String(error) }))
    }
  }
  const maintenanceAction = (operation: SetupOperation) => {
    if (operation === 'modify') { setModifying(true); setScreen('configure'); return }
    if (operation === 'uninstall') { setScreen('uninstall'); return }
    void execute(operation)
  }

  const progressBack = () => {
    const operation = progress?.operation
    if (operation === 'install') setScreen('configure')
    else if (operation === 'uninstall') setScreen('uninstall')
    else setScreen('maintenance')
  }
  const retry = () => { if (progress?.operation) void execute(progress.operation) }

  return <Layout screen={screen} locale={locale} setLocale={setLocale} onClose={close}>
    {screen === 'configure' && <Configure status={status} options={options} setOptions={setOptions} modifying={modifying} onBack={() => { setModifying(false); setScreen('maintenance') }} onSubmit={() => execute(modifying ? 'modify' : 'install')} t={t} />}
    {screen === 'progress' && <Progress progress={progress} onCancel={() => command('cancel_operation')} onRetry={retry} onBack={progressBack} t={t} />}
    {screen === 'ready' && <Ready status={status} onClose={close} t={t} />}
    {screen === 'maintenance' && <Maintenance status={status} onAction={maintenanceAction} t={t} />}
    {screen === 'uninstall' && <Uninstall options={options} setOptions={setOptions} onBack={() => setScreen('maintenance')} onConfirm={() => execute('uninstall')} t={t} />}
    {screen === 'goodbye' && <Goodbye onReinstall={() => { setModifying(false); setScreen('configure') }} onClose={close} t={t} />}
  </Layout>
}

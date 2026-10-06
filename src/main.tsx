import React from 'react'
import ReactDOM from 'react-dom/client'
import { platform } from './platform'
import { translate } from './i18n'
import { useUIStore } from './stores/ui'
import { trackInputModality } from './lib/inputModality'
import './styles/index.css'

trackInputModality()

const container = document.getElementById('root') as HTMLElement
let root: ReturnType<typeof ReactDOM.createRoot> | null = null

/**
 * Pantalla previa a React y al I18nProvider: los textos salen del catálogo con
 * el idioma que la app ya tenía guardado.
 */
function migrationFailure(error: unknown): void {
  const lang = useUIStore.getState().lang
  const detail = error instanceof Error ? error.message : String(error)
  container.innerHTML = ''
  const panel = document.createElement('main')
  panel.setAttribute('role', 'alert')
  panel.style.cssText = 'max-width:640px;margin:15vh auto;padding:32px;color:#f7f1ff;font:15px/1.5 system-ui;background:#17121f;border:1px solid #6d42a6;border-radius:16px'
  const title = document.createElement('h1')
  title.textContent = translate(lang, 'migration.failedTitle')
  const copy = document.createElement('p')
  copy.textContent = translate(lang, 'migration.failedBody')
  const code = document.createElement('pre')
  code.textContent = detail
  code.style.whiteSpace = 'pre-wrap'
  const retry = document.createElement('button')
  retry.type = 'button'
  retry.textContent = translate(lang, 'migration.retry')
  retry.style.cssText = 'padding:10px 16px;border:0;border-radius:8px;background:#8b5cf6;color:white;cursor:pointer'
  retry.onclick = async () => {
    retry.disabled = true
    try {
      await platform().migration.retry()
      await bootstrap()
    } catch (next) {
      migrationFailure(next)
    }
  }
  panel.append(title, copy, code, retry)
  container.append(panel)
}

async function bootstrap(): Promise<void> {
  container.innerHTML = ''
  try {
    const status = await platform().migration.importPending()
    if (status.state === 'failed') throw new Error(status.error || 'migration failed')
  } catch (error) {
    migrationFailure(error)
    return
  }

  const [{ default: App }, { default: AdaptiveToaster }, parity, vertical] = await Promise.all([
    import('./App'),
    import('./components/AdaptiveToaster'),
    import('./services/parityProbe'),
    import('./services/browserVerticalUiProbe'),
  ])
  parity.registerParityProbe(
    (window as { rinariDesktop?: { parityMode?: boolean } }).rinariDesktop?.parityMode === true,
  )
  vertical.registerBrowserVerticalUiProbe(
    (window as { rinariDesktop?: { browserVerticalMode?: boolean } }).rinariDesktop?.browserVerticalMode === true,
  )
  root ??= ReactDOM.createRoot(container)
  root.render(
    <React.StrictMode>
      <App />
      <AdaptiveToaster />
    </React.StrictMode>,
  )
  if (import.meta.env.DEV) document.title = 'Rinari Agent (DEV)'
}

void bootstrap()

import { useEffect, useRef, useState } from 'react'
import { engineApi, commandMessage } from '../../services/engine'
import { platform } from '../../platform'
import type { ProviderAuthSnapshot } from '../../types/protocol.generated'
import { useI18n } from '../../i18n'

export default function ProviderAuthPanel({ providerAlias, onConnected }: { providerAlias: string; onConnected: () => void }) {
  const { t } = useI18n()
  const [auth, setAuth] = useState<ProviderAuthSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const connected = useRef(onConnected)
  connected.current = onConnected
  useEffect(() => {
    let active = true
    void engineApi.providerAuthGet(providerAlias).then(value => { if (active) setAuth(value) }).catch(err => { if (active) setError(commandMessage(err)) })
    return () => { active = false }
  }, [providerAlias])
  useEffect(() => {
    if (auth?.status !== 'waiting' || !auth.operation_id) return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const next = await engineApi.providerAuthGet(providerAlias, auth.operation_id!)
        if (!active) return
        setAuth(next)
        if (next.status === 'connected') connected.current()
        else if (next.status === 'waiting') timer = setTimeout(() => void poll(), 2000)
      } catch (err) { if (active) setError(commandMessage(err)) }
    }
    timer = setTimeout(() => void poll(), 2000)
    return () => { active = false; clearTimeout(timer) }
  }, [providerAlias, auth?.operation_id, auth?.status])

  async function action(kind: 'browser' | 'device' | 'cancel' | 'logout') {
    setBusy(true); setError('')
    try {
      const next = kind === 'cancel' ? await engineApi.providerAuthCancel(providerAlias)
        : kind === 'logout' ? await engineApi.providerAuthLogout(providerAlias)
          : await engineApi.providerAuthStart(providerAlias, kind)
      setAuth(next)
      if (kind === 'logout') connected.current()
      if (kind === 'browser' && next.authorization_url) await platform().opener.openUrl(next.authorization_url)
    } catch (err) { setError(commandMessage(err)) }
    finally { setBusy(false) }
  }
  const button = 'rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-50'
  return <div className="space-y-3">
    <p className="text-xs text-[var(--text-muted)]">{t('providers.experimental')}</p>
    <p role="status" className="text-sm">{auth ? t(`providers.authState.${auth.status}`) : t('providers.loading')}</p>
    {auth?.detail && <p className="text-sm text-[var(--text-muted)]">{auth.detail}</p>}
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    {auth?.user_code && <p className="rounded-xl bg-[var(--bg-subtle)] p-3 font-mono text-xl tracking-wider select-all">{auth.user_code}</p>}
    <div className="flex flex-wrap gap-2">
      {auth?.authorization_url && <button className={button} onClick={() => void platform().opener.openUrl(auth.authorization_url!)}>{t('providers.openLogin')}</button>}
      {auth?.status === 'waiting'
        ? <button disabled={busy} className={button} onClick={() => void action('cancel')}>{t('providers.cancel')}</button>
        : <>
          <button disabled={busy} className={button} onClick={() => void action('browser')}>{t('providers.login')}</button>
          <button disabled={busy} className={button} onClick={() => void action('device')}>{t('providers.deviceLogin')}</button>
          {auth?.status === 'connected' && <button disabled={busy} className={button} onClick={() => void action('logout')}>{t('providers.logout')}</button>}
        </>}
    </div>
  </div>
}

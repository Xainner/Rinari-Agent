import { KeyRound, LoaderCircle, LogIn, Power, RotateCcw, Zap } from 'lucide-react'
import { hasTranslation, useI18n, type I18nKey } from '../../i18n'
import { hintKey, hostOf, isOAuth, isRemote, primaryAction, STATE_LABEL, STATE_TONE, type ConnectorCapabilities } from './connectorModel'
import type { ConnectorItem } from './useConnectors'

/** Piezas que comparten la tarjeta y el detalle de un conector. */

export interface ConnectorActions {
  signIn: (item: ConnectorItem) => void
  reconnect: (item: ConnectorItem) => void
  test: (item: ConnectorItem) => void
  toggle: (item: ConnectorItem) => void
  edit: (item: ConnectorItem) => void
  remove: (item: ConnectorItem) => void
  signOut: (item: ConnectorItem) => void
  details: (item: ConnectorItem) => void
}

/** El chip de estado: texto siempre (nunca solo color) y su tono. */
export function StateChip({ item }: { item: ConnectorItem }) {
  const { t } = useI18n()
  const tools = item.server.connection?.tools
  return (
    <span className="r-chip connector-state" data-tone={STATE_TONE[item.state]} data-state={item.state}>
      {item.state === 'connecting' && <LoaderCircle size={11} className="r-spin" aria-hidden="true" />}
      {t(STATE_LABEL[item.state])}
      {item.state === 'connected' && typeof tools === 'number' && tools > 0 && <span className="text-[var(--text-subtle)]">· {t('connectors.toolCount', { n: tools })}</span>}
    </span>
  )
}

/** La línea que dice qué falla y qué hacer, con la pista del Engine. */
export function StateHint({ item, caps }: { item: ConnectorItem; caps: ConnectorCapabilities }) {
  const { t } = useI18n()
  const connection = item.server.connection
  if (item.state === 'reauth') return <p className="connector-hint" data-tone="warning">{t('connectors.hint.reauth_required')}</p>
  if (item.state === 'signin') return <p className="connector-hint" data-tone="warning">{t(caps.oauth ? 'connectors.hint.oauth_required' : 'mcp.hint.oauth_required')}</p>
  if (item.state !== 'error') return null
  const key = hintKey(connection?.hint, caps.oauth, hasTranslation)
  const code = connection?.code ? `mcp.code.${connection.code}` : ''
  return (
    <div className="connector-hint" data-tone="danger">
      <p>{hasTranslation(code) ? t(code) : t('mcp.code.unknown')}{key ? ` — ${t(key)}` : ''}</p>
      {typeof connection?.retry_in_s === 'number' && <p className="text-[var(--text-subtle)]">{t('connectors.retryingSoon')}</p>}
    </div>
  )
}

/** Quién es la cuenta: el Engine dice si hay sesión y con qué servidor de autorización, no el correo. */
export function AccountLine({ item }: { item: ConnectorItem }) {
  const { t } = useI18n()
  const server = item.server
  if (isOAuth(server)) {
    const auth = item.auth
    if (!auth) return null
    if (auth.signed_in && !auth.reauth_required) return <p className="connector-meta"><KeyRound size={12} aria-hidden="true" />{auth.issuer ? t('connectors.account.signedInAt', { host: hostOf(auth.issuer) }) : t('connectors.account.signedIn')}</p>
    return <p className="connector-meta"><KeyRound size={12} aria-hidden="true" />{t('connectors.account.notSignedIn')}</p>
  }
  if (!isRemote(server)) return null
  const auth = server.auth
  if (!auth || auth.kind === 'none') return <p className="connector-meta"><KeyRound size={12} aria-hidden="true" />{t('mcp.authNone')}</p>
  if (auth.kind === 'bearer') {
    const text = !auth.token?.configured ? t('mcp.authBearerMissing') : auth.token.source === 'env' ? t('mcp.authBearerEnv', { name: auth.token.env_var ?? '' }) : t('mcp.authBearerStored')
    return <p className="connector-meta"><KeyRound size={12} aria-hidden="true" />{text}</p>
  }
  return <p className="connector-meta"><KeyRound size={12} aria-hidden="true" />{t('mcp.authHeaders', { n: server.headers?.length ?? 0 })}</p>
}

const ACTION_LABEL: Record<NonNullable<ReturnType<typeof primaryAction>>, I18nKey> = {
  sign_in: 'connectors.action.signIn',
  reconnect: 'connectors.action.reconnect',
  enable: 'connectors.action.enable',
  test: 'mcp.test',
}

export function PrimaryButton({ item, caps, actions, size = 'sm' }: { item: ConnectorItem; caps: ConnectorCapabilities; actions: ConnectorActions; size?: 'sm' | 'md' }) {
  const { t } = useI18n()
  const action = primaryAction(item.state, caps, item.server)
  if (!action) return null
  const signIn = action === 'sign_in'
  const label = signIn && item.state === 'reauth' ? t('connectors.action.reconnect') : t(ACTION_LABEL[action])
  const icon = signIn ? <LogIn size={13} /> : action === 'enable' ? <Power size={13} /> : action === 'test' ? <Zap size={13} /> : <RotateCcw size={13} />
  const run = { sign_in: actions.signIn, reconnect: actions.reconnect, enable: actions.toggle, test: actions.test }[action]
  return <button type="button" className={`btn btn-primary${size === 'sm' ? ' btn-sm' : ''}`} data-action={action} onClick={() => run(item)}>{icon} {label}</button>
}

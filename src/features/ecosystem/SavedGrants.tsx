import { FolderGit2, MessageSquare, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { commandMessage, engineApi, type PermissionGrant } from '../../services/engine'
import { useI18n, type I18nKey } from '../../i18n'
import { Section } from '../../components/settings/parts'

/** Lo que cada regla permite, en palabras. `{target}` es el host, la carpeta o el destino. */
const RULE_LABEL: Record<string, I18nKey> = {
  network_send: 'grants.rule.networkSend',
  network_host: 'grants.rule.networkHost',
  write_outside_root: 'grants.rule.writeOutside',
  shell_external_mutation: 'grants.rule.shellOutside',
  git_remote_mutation: 'grants.rule.gitPush',
  mcp_call: 'grants.rule.mcp',
  browser_interact: 'grants.rule.browser',
  browser_upload: 'grants.rule.upload',
  'peer-message': 'grants.rule.peer',
}

/**
 * Ajustes > Herramientas y permisos > «Permitido siempre»: lo que se aprobó
 * con «Siempre en este proyecto» (o en los chats), agrupado por dónde vale,
 * con su botón para quitarlo. Lo guarda y lo aplica el Engine.
 */
export default function SavedGrants() {
  const { t } = useI18n()
  const [grants, setGrants] = useState<PermissionGrant[] | null>(null)

  const reload = useCallback(async () => {
    try {
      setGrants((await engineApi.permissionGrantsList()).grants)
    } catch (err) {
      setGrants([])
      toast.error(commandMessage(err))
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const revoke = async (grant: PermissionGrant) => {
    try {
      await engineApi.permissionGrantsRevoke(grant.id)
      setGrants((current) => (current ?? []).filter((item) => item.id !== grant.id))
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  const label = (grant: PermissionGrant) => {
    const key = grant.rule_id ? RULE_LABEL[grant.rule_id] : undefined
    return key ? t(key, { target: grant.target ?? '' }) : grant.description || grant.capability
  }
  const groups = new Map<string, PermissionGrant[]>()
  for (const grant of grants ?? []) groups.set(grant.scope, [...(groups.get(grant.scope) ?? []), grant])

  return (
    <Section title={t('grants.title')}>
      <p className="text-xs text-[var(--text-subtle)]">{t('grants.hint')}</p>
      {grants !== null && grants.length === 0 && (
        <p className="text-xs text-[var(--text-muted)]">{t('grants.empty')}</p>
      )}
      {[...groups.entries()].map(([scope, rows]) => {
        const chats = rows[0].scope_kind === 'chats'
        const Icon = chats ? MessageSquare : FolderGit2
        return (
          <div key={scope} className="space-y-1">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text)]" title={chats ? undefined : scope}>
              <Icon size={12} aria-hidden="true" />
              {chats ? t('grants.chats') : rows[0].scope_label || scope}
            </p>
            <ul className="space-y-1">
              {rows.map((grant) => (
                <li key={grant.id} className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs">
                  <span className="min-w-0 flex-1 truncate text-[var(--text-muted)]" title={grant.description}>{label(grant)}</span>
                  <button
                    type="button"
                    aria-label={t('grants.revoke', { what: label(grant) })}
                    title={t('grants.revoke', { what: label(grant) })}
                    onClick={() => void revoke(grant)}
                    className="rounded p-1 text-[var(--text-subtle)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </Section>
  )
}

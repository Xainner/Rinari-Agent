import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Plug, RefreshCw, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../../i18n'
import { commandMessage, engineApi, type McpCatalogEntry } from '../../../services/engine'
import { Select } from '../../../components/ui/select'
import { CatalogDialog } from '../../connectors/CatalogDialog'
import { ConnectorLogo } from '../../connectors/ConnectorLogo'
import { SignInDialog, useSignIn } from '../../connectors/SignInDialog'
import { useAgencyData } from '../AgencyData'
import { useConnectorDirectory } from '../useConnectorDirectory'
import type { TeamSetupItem } from '../types'

/**
 * «Para empezar»: lo que le falta a un equipo armado con Rinari (un conector
 * del catálogo por conectar, una necesidad sin conector). Cada pieza se
 * conecta, se cubre con un conector del dueño o la hace él; el flujo y las
 * rutinas que esperaban arrancan solos cuando no queda ninguna.
 */
export default function TeamSetup({ teamId, items, onChanged }: {
  teamId: string
  items: TeamSetupItem[]
  onChanged: () => void
}) {
  const { t } = useI18n()
  const [setup, setSetup] = useState(items)
  const [busy, setBusy] = useState<string | null>(null)
  const [connecting, setConnecting] = useState<TeamSetupItem | null>(null)
  const [catalog, setCatalog] = useState<McpCatalogEntry[]>([])
  const { marks } = useConnectorDirectory()
  // The team overview carries the pieces without names: the app knows its agents.
  const { agents } = useAgencyData()
  const nameOf = (item: TeamSetupItem) => item.agent || agents.find((agent) => agent.id === item.agent_id)?.name || ''
  const openSignIn = useSignIn((state) => state.open)

  useEffect(() => setSetup(items), [items])
  useEffect(() => {
    engineApi.mcpCatalogList().then((result) => setCatalog(result.entries)).catch(() => {})
  }, [])

  const done = setup.filter((item) => item.status === 'done').length
  const pending = setup.filter((item) => item.status === 'pending')
  const yours = useMemo(() => marks.filter((mark) => mark.enabled), [marks])

  const refresh = async () => {
    setBusy('refresh')
    try {
      const result = await engineApi.agencyTeamSetup(teamId)
      setSetup(result.setup)
      onChanged()
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const resolve = async (item: TeamSetupItem, action: 'assign' | 'manual', connector?: string) => {
    setBusy(item.id)
    try {
      const result = await engineApi.agencyTeamSetupResolve(teamId, item.id, action, connector)
      setSetup(result.setup)
      onChanged()
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setBusy(null)
    }
  }

  if (setup.length === 0) return null

  return (
    <section className="office-panel-section team-setup" data-testid="agency-team-setup" data-done={pending.length === 0 || undefined}>
      <div className="agency-work-head">
        <h3>{t('agency.setup.title')}</h3>
        <span className="r-chip" data-tone={pending.length === 0 ? 'success' : 'warning'}>
          {t('agency.setup.progress', { done, total: setup.length })}
        </span>
        <span className="flex-1" />
        {pending.length > 0 && (
          <button type="button" className="btn btn-quiet btn-xs" disabled={busy !== null} onClick={() => void refresh()} data-testid="agency-team-setup-check">
            <RefreshCw size={12} aria-hidden="true" className={busy === 'refresh' ? 'animate-spin motion-reduce:animate-none' : undefined} /> {t('agency.setup.check')}
          </button>
        )}
      </div>
      <p className="field-hint mt-0">{pending.length === 0 ? t('agency.setup.allDone') : t('agency.setup.hint')}</p>
      <ul className="team-setup-list">
        {setup.map((item) => {
          const entry = item.catalog_id ? catalog.find((value) => value.id === item.catalog_id) : undefined
          const label = item.kind === 'catalog'
            ? t('agency.setup.catalog', { name: entry?.name ?? item.name ?? item.catalog_id ?? '' })
            : t('agency.setup.need', { need: item.need ?? '' })
          if (item.status === 'done') {
            const [how, name] = (item.resolution ?? '').split(':')
            return (
              <li key={item.id} className="team-setup-item is-done" data-testid="agency-team-setup-item" data-status="done">
                <CheckCircle2 size={14} aria-hidden="true" className="team-setup-check" />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                <span className="team-setup-how">
                  {how === 'connected' ? t('agency.setup.doneConnected', { name: name ?? '' })
                    : how === 'assigned' ? t('agency.setup.doneAssigned', { name: name ?? '' })
                      : t('agency.setup.doneManual')}
                </span>
              </li>
            )
          }
          return (
            <li key={item.id} className="team-setup-item" data-testid="agency-team-setup-item" data-status="pending">
              <div className="team-setup-row">
                {item.kind === 'catalog'
                  ? <ConnectorLogo name={entry?.name ?? item.name ?? ''} logo={entry?.logo} tone={entry?.category ?? 'remote'} size={26} />
                  : <span className="team-setup-need" aria-hidden="true"><AlertTriangle size={14} /></span>}
                <div className="min-w-0 flex-1">
                  <p className="team-setup-title">{label}</p>
                  <p className="team-setup-for"><UserRound size={11} aria-hidden="true" /> {t('agency.setup.for', { agent: nameOf(item) })}</p>
                </div>
              </div>
              <div className="team-setup-actions">
                {item.kind === 'catalog' && (
                  <button type="button" className="btn btn-primary btn-xs" disabled={busy !== null} onClick={() => setConnecting(item)} data-testid="agency-team-setup-connect">
                    <Plug size={12} aria-hidden="true" /> {t('agency.setup.connect')}
                  </button>
                )}
                {yours.length > 0 && (
                  <Select<string>
                    compact
                    value={null}
                    disabled={busy !== null}
                    label={t('agency.setup.assign')}
                    placeholder={t('agency.setup.assign')}
                    options={yours.map((mark) => ({
                      value: mark.name,
                      label: mark.label,
                      icon: <ConnectorLogo name={mark.label} logo={mark.logo} tone={mark.tone} size={16} />,
                    }))}
                    onChange={(value) => void resolve(item, 'assign', value)}
                    testId="agency-team-setup-assign"
                  />
                )}
                <button type="button" className="btn btn-ghost btn-xs" disabled={busy !== null} onClick={() => void resolve(item, 'manual')} data-testid="agency-team-setup-manual">
                  {t('agency.setup.manual')}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      <CatalogDialog
        open={connecting !== null}
        entryId={connecting?.catalog_id}
        owner={`team:${teamId}`}
        onClose={() => setConnecting(null)}
        onAdded={(server, next, label) => {
          setConnecting(null)
          if (next === 'sign_in') openSignIn(server.name, label)
          void refresh()
        }}
      />
      <SignInDialog />
    </section>
  )
}

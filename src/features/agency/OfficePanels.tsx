import { useEffect, useState } from 'react'
import { ClipboardList, Crown, SlidersHorizontal, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { create } from 'zustand'
import { useI18n } from '../../i18n'
import { Select } from '../../components/ui/select'
import { commandMessage, engineApi } from '../../services/engine'
import { useSessionDockStore } from '../../stores/sessionDock'
import { useAgencyStore } from '../../stores/agency'
import { ConnectorLogo } from '../connectors/ConnectorLogo'
import AgentAvatar from './AgentAvatar'
import { officeDockKey, useAgencyData } from './AgencyData'
import { useConnectorDirectory } from './useConnectorDirectory'
import { postState } from './postState'
import type { AgencyAgent } from './types'

const NOBODY = '__chief__'

/** El título que trae «/recado …» desde el chat de la oficina, por equipo, hasta que se abre el recado. */
interface ErrandDrafts {
  titles: Record<string, string>
  setTitle: (teamId: string, title: string) => void
  take: (teamId: string) => string
}
export const useErrandDrafts = create<ErrandDrafts>((set, get) => ({
  titles: {},
  setTitle: (teamId, title) => set((state) => ({ titles: { ...state.titles, [teamId]: title } })),
  take: (teamId) => {
    const title = get().titles[teamId] ?? ''
    if (title) set((state) => { const titles = { ...state.titles }; delete titles[teamId]; return { titles } })
    return title
  },
}))

/** «/recado …» o el botón de la barra: abre «Recado» en el panel lateral de la oficina. */
export function openErrand(teamId: string, title = '') {
  if (title) useErrandDrafts.getState().setTitle(teamId, title)
  useSessionDockStore.getState().openView(officeDockKey(teamId), 'errand')
}

function useTeamMembers(teamId: string) {
  const { agents, teams, status } = useAgencyData()
  const team = teams.find((item) => item.id === teamId) ?? null
  const members = team
    ? team.members.map((id) => agents.find((agent) => agent.id === id)).filter((agent): agent is AgencyAgent => Boolean(agent))
    : []
  return { team, members, agents, status }
}

/**
 * «Recado» en el panel lateral de la oficina (D-3): para quién, qué, cómo se
 * sabe que está hecho. Sin destinatario va al jefe. Al dejarlo, la vista se
 * cierra y el recado aparece en el chat y en la pizarra.
 */
export function ErrandPanel({ teamId }: { teamId: string }) {
  const { t } = useI18n()
  const { team, members } = useTeamMembers(teamId)
  const [title, setTitle] = useState(() => useErrandDrafts.getState().take(teamId))
  const [body, setBody] = useState('')
  const [checks, setChecks] = useState('')
  const [to, setTo] = useState<string>(NOBODY)
  const [leaving, setLeaving] = useState(false)
  const pending = useErrandDrafts((state) => state.titles[teamId])
  // Un «/recado …» nuevo con la vista ya abierta llena el título.
  useEffect(() => {
    if (pending) setTitle(useErrandDrafts.getState().take(teamId))
  }, [pending, teamId])

  if (!team) return null
  const chief = team.chief_agent_id ? members.find((agent) => agent.id === team.chief_agent_id) ?? null : null

  const leave = async () => {
    if (!title.trim() || leaving) return
    setLeaving(true)
    try {
      await engineApi.agencyCreateErrand(team.id, {
        title: title.trim(),
        body: body.trim(),
        done_when: checks.split('\n').map((line) => line.trim()).filter(Boolean),
        to_agent_id: to === NOBODY ? null : to,
      })
      setTitle('')
      setBody('')
      setChecks('')
      setTo(NOBODY)
      useSessionDockStore.getState().closeView(officeDockKey(team.id), 'errand')
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setLeaving(false)
    }
  }

  return (
    <form
      className="office-panel"
      data-testid="agency-errand-form"
      onSubmit={(event) => {
        event.preventDefault()
        void leave()
      }}
    >
      <div className="office-panel-body">
        <p className="office-panel-lead"><ClipboardList size={14} aria-hidden="true" />{t('agency.errand.lead')}</p>
        <label className="grid gap-1.5">
          <span className="field-label mt-0">{t('agency.errand.title')}</span>
          <input className="field-input" value={title} maxLength={200} required autoFocus onChange={(event) => setTitle(event.target.value)} data-testid="agency-errand-title" />
        </label>
        <div className="grid gap-1.5">
          <span className="field-label mt-0">{t('agency.errand.to')}</span>
          <Select
            value={to}
            label={t('agency.errand.to')}
            options={[
              { value: NOBODY, label: chief ? t('agency.errand.toChief', { name: chief.name }) : t('agency.errand.nobody'), icon: chief ? <AgentAvatar agent={chief} size={18} /> : <Crown size={14} aria-hidden="true" />, detail: t('agency.errand.toChiefDetail') },
              ...members.map((agent) => ({ value: agent.id, label: agent.name, detail: agent.role || undefined, icon: <AgentAvatar agent={agent} size={18} /> })),
            ]}
            onChange={setTo}
            testId="agency-errand-to"
          />
        </div>
        <label className="grid gap-1.5">
          <span className="field-label mt-0">{t('agency.errand.body')}</span>
          <textarea className="field-input min-h-[84px] resize-y leading-relaxed" value={body} maxLength={8000} onChange={(event) => setBody(event.target.value)} />
        </label>
        <label className="grid gap-1.5">
          <span className="field-label mt-0">{t('agency.errand.doneWhen')}</span>
          <textarea className="field-input min-h-[84px] resize-y leading-relaxed" value={checks} placeholder={t('agency.errand.doneWhenPlaceholder')} onChange={(event) => setChecks(event.target.value)} data-testid="agency-errand-checks" />
          <span className="field-hint">{t('agency.errand.doneWhenHint')}</span>
        </label>
      </div>
      <footer className="office-panel-foot" data-toast-avoid="">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => useSessionDockStore.getState().closeView(officeDockKey(team.id), 'errand')}>{t('agency.settings.cancel')}</button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={!title.trim() || leaving} data-testid="agency-errand-submit">{t('agency.errand.leave')}</button>
      </footer>
    </form>
  )
}

/** «Ficha» en el panel lateral de la oficina: quién está, quién es el jefe, sus conectores y su presupuesto. */
export function TeamPanel({ teamId }: { teamId: string }) {
  const { t, lang } = useI18n()
  // Figures in the app's language, not the system's.
  const locale = lang === 'es' ? 'es' : 'en'
  const usd = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
  const count = new Intl.NumberFormat(locale)
  const { team, members, status } = useTeamMembers(teamId)
  const { byName } = useConnectorDirectory()
  if (!team) return null
  const budget = [
    team.budget.daily_usd ? t('agency.team.card.usd', { value: usd.format(team.budget.daily_usd) }) : null,
    team.budget.daily_tokens ? t('agency.team.card.tokens', { value: count.format(team.budget.daily_tokens) }) : null,
  ].filter(Boolean).join(' · ')
  return (
    <div className="office-panel" data-testid="agency-team-card">
      <div className="office-panel-body">
        {team.purpose && <p className="office-panel-purpose">{team.purpose}</p>}
        <section className="office-panel-section">
          <h3>{t('agency.team.card.members', { n: members.length })}</h3>
          <ul className="office-member-list">
            {members.map((agent) => (
              <li key={agent.id} className="office-member">
                <AgentAvatar agent={agent} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-[var(--text)]">{agent.name}</span>
                  {agent.role && <span className="block truncate text-[11.5px] text-[var(--text-subtle)]">{agent.role}</span>}
                </span>
                {(() => {
                  // What its post does now (agency_audit_v1), in words as well as color.
                  const state = postState(team, agent.id, status)
                  if (state === 'idle') return null
                  return (
                    <span className="r-chip" data-tone={state === 'needs_you' ? 'warning' : 'accent'} data-testid="agency-member-state">
                      {state === 'working' && <span className="agency-working-dot" aria-hidden="true" />}
                      {t(state === 'needs_you' ? 'agency.agent.needsYou' : 'agency.agent.working')}
                    </span>
                  )
                })()}
                {team.chief_agent_id === agent.id && <span className="r-chip" data-tone="accent"><Crown size={11} aria-hidden="true" />{t('agency.team.chiefShort')}</span>}
              </li>
            ))}
          </ul>
        </section>
        <section className="office-panel-section">
          <h3>{t('agency.team.card.connectors')}</h3>
          <p className="field-hint mt-0">{t('agency.team.card.connectorsHint')}</p>
          {team.connectors.length === 0 ? (
            <p className="field-hint mt-0">{t('agency.team.card.noConnectors')}</p>
          ) : (
            <ul className="office-connector-list">
              {team.connectors.map((name) => {
                const mark = byName.get(name)
                return (
                  <li key={name} className="office-connector">
                    <ConnectorLogo name={mark?.label ?? name} logo={mark?.logo} tone={mark?.tone ?? 'remote'} size={22} />
                    <span className="truncate">{mark?.label ?? name}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
        <section className="office-panel-section">
          <h3>{t('agency.team.card.budget')}</h3>
          <p className="office-panel-line"><Wallet size={13} aria-hidden="true" />{budget || t('agency.team.card.noBudget')}</p>
        </section>
      </div>
      <footer className="office-panel-foot">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => useAgencyStore.getState().editTeam(team.id)} data-testid="agency-team-card-edit">
          <SlidersHorizontal size={13} aria-hidden="true" /> {t('agency.team.card.edit')}
        </button>
      </footer>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Plug, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { Select } from '../../components/ui/select'
import { commandMessage, engineApi, onEngineEvent, type McpServer } from '../../services/engine'
import { memoryApi } from '../../services/memory'
import type { MemoryRecord } from '../memory/types'
import { CatalogDialog } from '../connectors/CatalogDialog'
import { SignInDialog, useSignIn } from '../connectors/SignInDialog'
import type { AgencyAgent } from './types'

interface AgencySettingsProps {
  agents: AgencyAgent[]
  /** El agente con el que se abre (el del chat abierto, si hay uno). */
  initialAgentId?: string | null
}

/** Un recuerdo del agente: se corrige en su sitio o se olvida. */
function MemoryRow({ record, onChanged }: { record: MemoryRecord; onChanged: () => void }) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(record.text)

  const save = async () => {
    try {
      await memoryApi.update(record.id, record.revision, { text: text.trim() })
      setEditing(false)
      onChanged()
    } catch (error) {
      toast.error(commandMessage(error))
    }
  }
  const forget = async () => {
    try {
      await memoryApi.forget(record.id, record.revision)
      onChanged()
    } catch (error) {
      toast.error(commandMessage(error))
    }
  }

  return (
    <li className="agency-memory-row" data-testid="agency-memory-row">
      <span className="agency-memory-topic">{record.topic}</span>
      {editing ? (
        <div className="grid gap-2">
          <textarea className="field-input min-h-[64px] resize-y" value={text} maxLength={4096} onChange={(event) => setText(event.target.value)} aria-label={t('agency.settings.text')} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => { setEditing(false); setText(record.text) }}>{t('agency.settings.cancel')}</button>
            <button type="button" className="btn btn-primary btn-xs" disabled={!text.trim()} onClick={() => void save()}>{t('agency.settings.save')}</button>
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-[var(--text)]">{record.text}</p>
      )}
      {!editing && (
        <div className="flex justify-end gap-1">
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setEditing(true)}>{t('agency.settings.edit')}</button>
          <button type="button" className="btn btn-quiet btn-xs" onClick={() => void forget()} aria-label={`${t('agency.settings.forget')} · ${record.topic}`}>
            <Trash2 size={12} aria-hidden="true" /> {t('agency.settings.forget')}
          </button>
        </div>
      )}
    </li>
  )
}

/**
 * Ajustes de la Agency (D-24): por agente, su memoria propia (lo que aprende
 * en su chat directo, nunca en la memoria del dueño) y sus cuentas propias
 * (C8), que solo ese agente ve y usa. Una cuenta se conecta desde el catálogo
 * de conectores, a nombre del agente.
 */
export default function AgencySettings({ agents, initialAgentId = null }: AgencySettingsProps) {
  const { t } = useI18n()
  const [agentId, setAgentId] = useState<string | null>(initialAgentId ?? agents[0]?.id ?? null)
  const [records, setRecords] = useState<MemoryRecord[]>([])
  const [accounts, setAccounts] = useState<McpServer[]>([])
  const [topic, setTopic] = useState('')
  const [text, setText] = useState('')
  const [catalogOpen, setCatalogOpen] = useState(false)
  const openSignIn = useSignIn((state) => state.open)
  const agent = agents.find((item) => item.id === agentId) ?? null

  useEffect(() => {
    if (!agentId && agents[0]) setAgentId(agents[0].id)
  }, [agentId, agents])

  const reload = useCallback(async () => {
    if (!agentId) return
    try {
      const [memory, servers] = await Promise.all([engineApi.agencyAgentMemory(agentId), engineApi.mcpList()])
      setRecords(memory.records)
      setAccounts(servers.servers.filter((server) => server.owner === `agent:${agentId}`))
    } catch (error) {
      toast.error(commandMessage(error))
    }
  }, [agentId])

  useEffect(() => {
    void reload()
    let stop: (() => void) | undefined
    let disposed = false
    void onEngineEvent((event) => {
      if (event.event === 'mcp.status.changed' || event.event.startsWith('memory.')) void reload()
    }).then((unlisten) => {
      if (disposed) unlisten()
      else stop = unlisten
    })
    return () => {
      disposed = true
      stop?.()
    }
  }, [reload])

  const remember = async () => {
    if (!agentId || !topic.trim() || !text.trim()) return
    try {
      await engineApi.agencyAgentRemember(agentId, topic.trim(), text.trim())
      setTopic('')
      setText('')
      await reload()
    } catch (error) {
      toast.error(commandMessage(error))
    }
  }

  if (agents.length === 0) {
    return (
      <div className="agency-form-page" data-testid="agency-settings">
        <div className="agency-form">
          <h1 className="font-display text-[22px] font-semibold text-[var(--text)]">{t('agency.settings.title')}</h1>
          <p className="field-hint">{t('agency.settings.noAgents')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="agency-form-page" data-testid="agency-settings">
      <div className="agency-form">
        <header className="grid gap-1">
          <h1 className="font-display text-[22px] font-semibold text-[var(--text)]">{t('agency.settings.title')}</h1>
          <p className="field-hint">{t('agency.settings.intro')}</p>
        </header>

        <div className="grid max-w-sm gap-1.5">
          <span className="field-label">{t('agency.settings.agent')}</span>
          <Select
            value={agentId}
            label={t('agency.settings.agent')}
            options={agents.map((item) => ({ value: item.id, label: item.name, detail: item.role || undefined }))}
            onChange={setAgentId}
            testId="agency-settings-agent"
          />
        </div>

        {agent && (
          <>
            <section className="grid gap-3" aria-labelledby="agency-memory-title">
              <div>
                <h2 id="agency-memory-title" className="text-[15px] font-semibold text-[var(--text)]">{t('agency.settings.memory', { name: agent.name })}</h2>
                <p className="field-hint">{t('agency.settings.memoryHint')}</p>
              </div>
              {records.length === 0 ? (
                <p className="field-hint">{t('agency.settings.memoryEmpty')}</p>
              ) : (
                <ul className="grid gap-2">
                  {records.map((record) => <MemoryRow key={`${record.id}:${record.revision}`} record={record} onChanged={() => void reload()} />)}
                </ul>
              )}
              <div className="agency-memory-add">
                <input className="field-input" value={topic} maxLength={128} placeholder={t('agency.settings.topic')} aria-label={t('agency.settings.topic')} onChange={(event) => setTopic(event.target.value)} data-testid="agency-memory-topic" />
                <input className="field-input" value={text} maxLength={4096} placeholder={t('agency.settings.text')} aria-label={t('agency.settings.text')} onChange={(event) => setText(event.target.value)} data-testid="agency-memory-text" />
                <button type="button" className="btn btn-secondary btn-sm" disabled={!topic.trim() || !text.trim()} onClick={() => void remember()} data-testid="agency-memory-add">
                  <Plus size={13} aria-hidden="true" /> {t('agency.settings.remember')}
                </button>
              </div>
            </section>

            <section className="grid gap-3" aria-labelledby="agency-accounts-title">
              <div>
                <h2 id="agency-accounts-title" className="text-[15px] font-semibold text-[var(--text)]">{t('agency.settings.accounts', { name: agent.name })}</h2>
                <p className="field-hint">{t('agency.settings.accountsHint')}</p>
              </div>
              {accounts.length === 0 ? (
                <p className="field-hint">{t('agency.settings.accountsEmpty')}</p>
              ) : (
                <ul className="agency-connectors">
                  {accounts.map((server) => (
                    <li key={server.name} className="agency-connector"><Plug size={13} aria-hidden="true" /><span className="truncate">{server.name}</span></li>
                  ))}
                </ul>
              )}
              <div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCatalogOpen(true)} data-testid="agency-connect-account">
                  <Plug size={13} aria-hidden="true" /> {t('agency.settings.connect')}
                </button>
              </div>
            </section>
          </>
        )}
      </div>
      {agent && (
        <CatalogDialog
          open={catalogOpen}
          owner={`agent:${agent.id}`}
          onClose={() => setCatalogOpen(false)}
          onAdded={(server, next, label) => {
            setCatalogOpen(false)
            void reload()
            if (next === 'sign_in') openSignIn(server.name, label)
          }}
        />
      )}
      <SignInDialog />
    </div>
  )
}

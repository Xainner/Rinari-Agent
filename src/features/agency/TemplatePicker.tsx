import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, LayoutTemplate, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import ModelPicker from '../../components/composer/ModelPicker'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'
import { commandMessage, engineApi, type ModelSummary, type ProviderSummary } from '../../services/engine'
import { useUIStore } from '../../stores/ui'
import type { AgencyTeam, AgencyTemplateSummary } from './types'

/**
 * «Usar una plantilla» (10.4, `agency_audit_v1`): los equipos listos para
 * empezar que trae Rinari, cada uno con sus oficios. Se elige uno y el
 * modelo con que trabajarán sus agentes, y se crea el equipo con agentes
 * nuevos. Nunca copia cuentas ni claves.
 */
export default function TemplatePicker({ open, onClose, onCreated }: {
  open: boolean
  onClose: () => void
  onCreated: (team: AgencyTeam) => void
}) {
  const { t, lang } = useI18n()
  const [templates, setTemplates] = useState<AgencyTemplateSummary[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [chosen, setChosen] = useState<string | null>(null)
  const [models, setModels] = useState<ModelSummary[]>([])
  const [providers, setProviders] = useState<ProviderSummary[]>([])
  const [model, setModel] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const creatingRef = useRef(false)

  const load = useCallback(() => {
    setFailed(false)
    engineApi.agencyTemplates(lang)
      .then((result) => {
        setTemplates(result.templates)
        setChosen((current) => current ?? result.templates[0]?.id ?? null)
      })
      .catch(() => setFailed(true))
  }, [lang])

  useEffect(() => {
    if (!open) return
    creatingRef.current = false
    setCreating(false)
    setTemplates(null)
    setChosen(null)
    setModel(null)
    load()
    engineApi.modelList().then((result) => setModels(result.models.filter((item) => item.saved !== false))).catch(() => {})
    engineApi.providerList().then((result) => setProviders(result.providers)).catch(() => {})
  }, [open, load])

  const create = async () => {
    // A double click made the team (and its agents) twice.
    if (!chosen || creatingRef.current) return
    creatingRef.current = true
    setCreating(true)
    try {
      const result = await engineApi.agencyTeamFromTemplate(chosen, model, lang)
      toast.success(t('agency.templates.created', { name: result.team.name, n: result.agents.length }))
      // Made: it stays «creating» until the dialog closes, so a second click makes nothing.
      onCreated(result.team)
      onClose()
    } catch (error) {
      toast.error(commandMessage(error))
      creatingRef.current = false
      setCreating(false)
    }
  }

  const chosenModel = model ? models.find((item) => item.id === model) ?? null : null

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-w-2xl" data-testid="agency-template-picker">
        <DialogTitle>{t('agency.templates.title')}</DialogTitle>
        <DialogDescription>{t('agency.templates.hint')}</DialogDescription>
        <div className="mt-4 max-h-[55vh] overflow-y-auto pr-1">
          {failed ? (
            <p className="field-hint" role="alert">
              {t('agency.templates.failed')}{' '}
              <button type="button" className="btn btn-quiet btn-xs" onClick={load}>{t('agency.rules.retry')}</button>
            </p>
          ) : templates === null ? (
            <p className="field-hint" aria-busy="true">{t('agency.settings.loading')}</p>
          ) : templates.length === 0 ? (
            <p className="field-hint">{t('agency.templates.empty')}</p>
          ) : (
            <div className="agency-template-grid" role="radiogroup" aria-label={t('agency.templates.title')}>
              {templates.map((template) => {
                const checked = template.id === chosen
                return (
                  <button
                    key={template.id}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    className={cn('agency-template-card', checked && 'is-checked')}
                    onClick={() => setChosen(template.id)}
                    data-testid="agency-template"
                  >
                    <span className="agency-template-head">
                      <span className="agency-option-icon"><LayoutTemplate size={15} aria-hidden="true" /></span>
                      <span className="min-w-0 flex-1 truncate font-semibold text-[var(--text)]">{template.name}</span>
                      {checked && <span className="agency-option-check" aria-hidden="true"><Check size={12} /></span>}
                    </span>
                    {template.purpose && <span className="agency-template-purpose">{template.purpose}</span>}
                    <span className="agency-template-roles" aria-label={t('agency.templates.agents', { n: template.agents.length })}>
                      {template.agents.map((agent) => (
                        <span key={`${agent.name}:${agent.role}`} className="r-chip" title={agent.role}>{agent.name}</span>
                      ))}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        {templates && templates.length > 0 && (
          <div className="mt-4 grid gap-1.5">
            <span className="field-label mt-0">{t('agency.templates.model')}</span>
            <div className="agency-model-row">
              <div className="agency-model-field">
                <ModelPicker
                  models={models}
                  providers={providers}
                  activeAlias={chosenModel?.alias ?? null}
                  activeModel={chosenModel}
                  missingLabel={t('agency.form.modelDefault')}
                  onUseModel={(item) => setModel(item.id)}
                  onDiscoverModels={() => {}}
                  onOpenProviders={() => useUIStore.getState().goSettings('providers')}
                />
              </div>
              {model !== null && (
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setModel(null)}>
                  <RotateCcw size={13} aria-hidden="true" /> {t('agency.form.modelUseDefault')}
                </button>
              )}
            </div>
            <span className="field-hint mt-0">{t('agency.templates.modelHint')}</span>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-ghost">{t('common.cancel')}</button>
          <button type="button" onClick={() => void create()} disabled={!chosen || creating} className="btn btn-primary" data-testid="agency-template-create">
            {creating ? t('agency.templates.creating') : t('agency.team.create')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

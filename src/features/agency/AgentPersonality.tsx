import { useCallback, useEffect, useState } from 'react'
import { Pencil, ScrollText, Sparkles, VenetianMask } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { Select } from '../../components/ui/select'
import { commandMessage, engineApi, type SoulDetail, type SoulSummary } from '../../services/engine'
import SoulEditorDialog, { soulDraftOf, type SoulDraft } from '../souls/SoulEditorDialog'
import { EditorSection, OptionCards } from './AgencyEditor'

type Mode = 'instructions' | 'soul'

/**
 * La personalidad de un agente (D-34): habla con la suya, nunca con la de
 * Rinari. «Sus instrucciones» (lo de siempre) o un Soul guardado, el de
 * Ajustes → Personalidad, que se edita aquí mismo con el editor de allí.
 * Editar un Soul de serie guarda una copia y el agente pasa a usarla.
 *
 * `onChange` recibe el Soul elegido (`null`: solo sus instrucciones); quien
 * lo usa decide si guarda al momento (Ajustes) o con la ficha (formulario).
 */
export default function AgentPersonality({ soulId, agentName, onChange, testId = 'agency-personality' }: {
  soulId: string | null
  agentName: string
  onChange: (soulId: string | null) => void
  testId?: string
}) {
  const { t } = useI18n()
  const [souls, setSouls] = useState<SoulSummary[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [mode, setMode] = useState<Mode>(soulId ? 'soul' : 'instructions')
  const [draft, setDraft] = useState<SoulDraft | null>(null)

  useEffect(() => {
    setMode(soulId ? 'soul' : 'instructions')
  }, [soulId])

  const load = useCallback(async () => {
    try {
      setSouls((await engineApi.soulList()).souls)
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const chosen = soulId ? souls?.find((soul) => soul.id === soulId) ?? null : null

  const pickMode = (next: Mode) => {
    setMode(next)
    // «Un Soul guardado» no elige uno por su cuenta: cuenta cuando el dueño lo elige.
    if (next === 'instructions' && soulId !== null) onChange(null)
  }

  const edit = async () => {
    if (!soulId) return
    try {
      const soul = (await engineApi.soulGet(soulId)).soul
      setDraft(soulDraftOf(soul, t('agency.personality.copyName', { soul: soul.name, agent: agentName || t('agency.form.title') })))
    } catch (error) {
      toast.error(commandMessage(error))
    }
  }

  const saved = (soul: SoulDetail) => {
    setDraft(null)
    void load()
    // A copy of a bundled Soul is the agent's from now on.
    if (soul.id !== soulId) onChange(soul.id)
    toast.success(t('agency.personality.saved', { name: soul.name }))
  }

  return (
    <EditorSection icon={VenetianMask} title={t('agency.personality.title')} hint={t('agency.personality.hint')} testId={testId}>
      <OptionCards<Mode>
        value={mode}
        label={t('agency.personality.title')}
        testId={`${testId}-mode`}
        onChange={pickMode}
        options={[
          { value: 'instructions', icon: ScrollText, title: t('agency.personality.instructions'), hint: t('agency.personality.instructionsHint') },
          { value: 'soul', icon: Sparkles, title: t('agency.personality.soul'), hint: t('agency.personality.soulHint') },
        ]}
      />
      {mode === 'soul' && (
        failed ? (
          <p className="field-hint mt-0" role="alert">
            {t('agency.personality.loadFailed')}{' '}
            <button type="button" className="btn btn-quiet btn-xs" onClick={() => void load()}>{t('agency.rules.retry')}</button>
          </p>
        ) : souls === null ? (
          <p className="field-hint mt-0" aria-busy="true">{t('agency.settings.loading')}</p>
        ) : souls.length === 0 ? (
          <p className="field-hint mt-0">{t('agency.personality.noSouls')}</p>
        ) : (
          <div className="agency-personality-row">
            <div className="min-w-0 flex-1">
              <Select
                value={soulId}
                label={t('agency.personality.soul')}
                placeholder={t('agency.personality.pick')}
                options={souls.map((soul) => ({
                  value: soul.id,
                  label: soul.name,
                  detail: soul.description || (soul.source === 'custom' ? t('soul.custom') : t('soul.bundled')),
                }))}
                onChange={(next) => onChange(next)}
                testId={`${testId}-soul`}
              />
            </div>
            <button type="button" className="btn btn-secondary btn-sm" disabled={!soulId} onClick={() => void edit()} data-testid={`${testId}-edit`}>
              <Pencil size={13} aria-hidden="true" /> {t('agency.personality.edit')}
            </button>
          </div>
        )
      )}
      {mode === 'soul' && chosen && chosen.source !== 'custom' && (
        <p className="field-hint mt-0">{t('agency.personality.bundledHint')}</p>
      )}
      {soulId && souls && !chosen && !failed && (
        <p className="field-hint mt-0" role="status">{t('agency.personality.missing')}</p>
      )}
      <SoulEditorDialog draft={draft} takenIds={(souls ?? []).map((soul) => soul.id)} onClose={() => setDraft(null)} onSaved={saved} />
    </EditorSection>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Combine } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { commandMessage, engineApi, type SkillDuplicatePair } from '../../services/engine'
import { dispatchAction } from '../../services/actions'
import { useComposerStore } from '../../stores/composer'
import { useConversationDraftStore } from '../../stores/conversationDraft'
import { SKILLS_CHANGED_EVENT } from '../../components/composer/useSlashCommands'

/**
 * Skills del dueño que parecen hacer lo mismo (Ajustes › Skills).
 *
 * El Engine las agrupa por lo que comparten; aquí solo se muestran. «Fusionar»
 * abre una conversación nueva con `/merge-skills a b` escrito: Rinari redacta
 * la skill combinada y la propone (las originales se apagan al aprobarla, no
 * se borran). Nada se envía sin que el dueño pulse Enter. «No son
 * duplicados» lo recuerda el Engine.
 */
export default function SkillDuplicates() {
  const { t } = useI18n()
  const [pairs, setPairs] = useState<SkillDuplicatePair[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setPairs((await engineApi.skillDuplicatesList()).pairs)
    } catch {
      // Un Engine sin el gestor no tiene la lista: no hay nada que mostrar.
      setPairs([])
    }
  }, [])

  useEffect(() => {
    void load()
    const reload = () => void load()
    window.addEventListener(SKILLS_CHANGED_EVENT, reload)
    return () => window.removeEventListener(SKILLS_CHANGED_EVENT, reload)
  }, [load])

  async function dismiss(pair: SkillDuplicatePair) {
    setBusy(true)
    try {
      setPairs((await engineApi.skillDuplicatesDismiss(pair.skills)).pairs)
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function merge(pair: SkillDuplicatePair) {
    dispatchAction('new-chat')
    const key = useConversationDraftStore.getState().normal?.key ?? 'draft'
    useComposerStore.getState().setTextFor(key, `/merge-skills ${pair.skills.join(' ')}`)
  }

  if (pairs.length === 0) return null
  const button =
    'rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-semibold hover:bg-[var(--bg-hover)] disabled:opacity-40'
  return (
    <section
      data-testid="skill-duplicates"
      aria-label={t('skills.duplicates.title')}
      className="space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4"
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
        <Combine size={14} aria-hidden="true" /> {t('skills.duplicates.title')} · {pairs.length}
      </h3>
      <p className="text-xs text-[var(--text-subtle)]">{t('skills.duplicates.desc')}</p>
      <ul className="space-y-2">
        {pairs.map((pair) => (
          <li
            key={pair.skills.join('|')}
            data-testid="skill-duplicate-pair"
            className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3"
          >
            <span className="min-w-0 text-sm font-medium text-[var(--text)] [overflow-wrap:anywhere]">
              {pair.skills[0]} · {pair.skills[1]}
            </span>
            {pair.shared.length > 0 && (
              <span className="text-[11px] text-[var(--text-subtle)]">
                {t('skills.duplicates.shared', { terms: pair.shared.slice(0, 4).join(', ') })}
              </span>
            )}
            <span className="ml-auto flex gap-1.5">
              <button type="button" disabled={busy} className={button} onClick={() => void dismiss(pair)}>
                {t('skills.duplicates.dismiss')}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => merge(pair)}
              >
                {t('skills.duplicates.merge')}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

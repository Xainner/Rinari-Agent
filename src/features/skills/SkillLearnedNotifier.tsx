import { useEffect } from 'react'
import { toast } from 'sonner'
import { commandMessage, engineApi, onEngineEvent, type SkillLearned } from '../../services/engine'
import { useI18n } from '../../i18n'
import { useUIStore } from '../../stores/ui'
import { SKILLS_CHANGED_EVENT } from '../../components/composer/useSlashCommands'
import { useNotificationCenter } from '../../stores/notificationCenter'

/**
 * Aviso cuando Rinari guarda o propone una skill (`skill.learned`).
 *
 * - Activa (`/learn`, o una mejora de una skill aprendida): ya está guardada, el
 *   aviso es para revisarla. «Revisar» abre su ficha con el cambio a la vista;
 *   «Deshacer» vuelve a la versión anterior (o la quita si era nueva).
 * - Pendiente (nueva y propuesta por su cuenta, sobre una skill instalada o con
 *   hallazgos peligrosos): espera aprobación en la biblioteca.
 *
 * Sin render propio.
 */
export default function SkillLearnedNotifier() {
  const { t } = useI18n()
  useEffect(() => {
    let disposed = false
    let stop: (() => void) | undefined
    void onEngineEvent((event) => {
      if (event.event !== 'skill.learned') return
      const learned = event.payload as SkillLearned
      window.dispatchEvent(new Event(SKILLS_CHANGED_EVENT))
      const active = learned.status === 'active'
      const title = !active
        ? t('skills.learned.proposed', { name: learned.name })
        : learned.update
          ? t('skills.learned.updated', { name: learned.name })
          : t('skills.learned.saved', { name: learned.name })
      const body = !active
        ? t('skills.learned.proposedBody')
        : learned.update
          ? t('skills.learned.updatedBody', { from: learned.previous_version ?? '—', to: learned.version })
          : undefined
      useNotificationCenter.getState().push({
        module: 'skills',
        title,
        body,
        tone: active ? 'success' : 'warning',
        target: active ? { kind: 'skills', skill: learned.name } : { kind: 'skills' },
      })
      // The conversation shows a card with the same actions (SkillProposalCard);
      // a toast on top of it was the same news twice. Engines without the card
      // (no `skill_manager_v1`) still get the toast.
      if (learned.card) return
      if (!active) {
        toast(title, {
          description: body,
          action: { label: t('skills.learned.review'), onClick: () => useUIStore.getState().goSettings('skills') },
        })
        return
      }
      toast.success(title, {
        description: body,
        action: { label: t('skills.learned.review'), onClick: () => useUIStore.getState().openSkill(learned.name) },
        cancel: {
          label: t('skills.learned.undo'),
          onClick: () => {
            void engineApi.skillRevert(learned.name)
              .then((result) => {
                window.dispatchEvent(new Event(SKILLS_CHANGED_EVENT))
                toast(result.removed
                  ? t('skills.learned.undoneRemoved', { name: learned.name })
                  : t('skills.learned.undoneRestored', { name: learned.name, version: result.restored ?? '' }))
              })
              .catch((err) => toast.error(commandMessage(err)))
          },
        },
      })
    }).then((unsubscribe) => {
      if (disposed) unsubscribe()
      else stop = unsubscribe
    })
    return () => {
      disposed = true
      stop?.()
    }
  }, [t])
  return null
}

import { useEffect } from 'react'
import { toast } from 'sonner'
import { commandMessage, engineApi, onEngineEvent, type SkillLearned } from '../../services/engine'
import { useI18n } from '../../i18n'
import { useUIStore } from '../../stores/ui'
import { SKILLS_CHANGED_EVENT } from '../../components/composer/useSlashCommands'

/**
 * Aviso cuando Rinari guarda o propone una skill (`skill.learned`). Con
 * `/learn` la skill ya está activa: «Ver» y «Deshacer». Si la propuso sola,
 * espera aprobación: «Revisar» abre la biblioteca. Sin render propio.
 */
export default function SkillLearnedNotifier() {
  const { t } = useI18n()
  useEffect(() => {
    let disposed = false
    let stop: (() => void) | undefined
    const openLibrary = () => useUIStore.getState().goSettings('skills')
    void onEngineEvent((event) => {
      if (event.event !== 'skill.learned') return
      const learned = event.payload as SkillLearned
      window.dispatchEvent(new Event(SKILLS_CHANGED_EVENT))
      if (learned.status === 'active') {
        toast.success(t(learned.update ? 'skills.learned.updated' : 'skills.learned.saved', { name: learned.name }), {
          action: {
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
          cancel: { label: t('skills.learned.view'), onClick: openLibrary },
        })
      } else {
        toast(t('skills.learned.proposed', { name: learned.name }), {
          action: { label: t('skills.learned.review'), onClick: openLibrary },
        })
      }
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

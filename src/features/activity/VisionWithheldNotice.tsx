import { useState } from 'react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { commandMessage, engineApi } from '../../services/engine'

/**
 * Lo que dice el aviso «siguió sin imágenes» según quién lo decidió (plan
 * 0.4.0 #14). Si fue Rinari (o una marca automática vieja, que se guardaba
 * como del dueño), ofrece «Volver a activar la visión»; un rechazo de este
 * turno solo no deja nada marcado.
 */
export function VisionWithheldNotice({ modelId, markedBy }: { modelId: string; markedBy?: string }) {
  const { t } = useI18n()
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const text = markedBy === 'auto'
    ? t('vision.withoutImagesAuto')
    : markedBy === 'turn'
      ? t('vision.withoutImagesTurn')
      : t('vision.withoutImages')
  const offer = (markedBy === 'auto' || markedBy === 'owner') && Boolean(modelId)
  async function reenable() {
    setState('busy')
    try {
      await engineApi.visionModelReset(modelId)
      setState('done')
      toast.success(t('vision.reenabled'))
    } catch (error) {
      setState('idle')
      toast.error(commandMessage(error))
    }
  }
  return (
    <>
      {text}
      {offer && state !== 'done' && (
        <>
          {' '}
          <button type="button" className="act-notice-action" data-testid="vision-reenable" disabled={state === 'busy'} onClick={() => void reenable()}>
            {t('vision.reenable')}
          </button>
        </>
      )}
    </>
  )
}

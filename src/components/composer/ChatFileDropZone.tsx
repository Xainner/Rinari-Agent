import { createContext, useCallback, useContext, useLayoutEffect, useRef, type ReactNode } from 'react'
import { useI18n } from '../../i18n'
import { hasFiles, useFileDrag } from './useFileDrag'

type Receiver = (files: File[]) => void
const RegisterReceiver = createContext<((receiver: Receiver) => () => void) | null>(null)

/** Register the current Composer's existing attachment pipeline, scoped to one chat. */
export function useChatFileReceiver(receiver: Receiver) {
  const register = useContext(RegisterReceiver)
  useLayoutEffect(() => register?.(receiver), [register, receiver])
}

export function ChatFileDropZone({ draftKey, enabled = true, children }: {
  draftKey: string
  enabled?: boolean
  children: ReactNode
}) {
  const { t } = useI18n()
  const drag = useFileDrag(draftKey, enabled)
  const receiver = useRef<Receiver | null>(null)
  const register = useCallback((next: Receiver) => {
    receiver.current = next
    return () => { if (receiver.current === next) receiver.current = null }
  }, [])

  return (
    <RegisterReceiver.Provider value={register}>
      <div ref={drag.ref} className="chat-file-drop-zone" data-file-drag={drag.active || undefined}
        onDragEnter={enabled ? drag.onDragEnter : undefined}
        onDragOver={enabled ? event => { if (hasFiles(event.dataTransfer)) drag.onDragOver(event) } : undefined}
        onDragLeave={enabled ? drag.onDragLeave : undefined}
        onDrop={enabled ? event => {
          drag.reset()
          if (!hasFiles(event.dataTransfer)) return
          event.preventDefault()
          receiver.current?.(Array.from(event.dataTransfer.files))
        } : undefined}>
        {children}
        {drag.active && (
          <div className="chat-file-drop-overlay" role="status">
            <span className="chat-file-drop-label">{t('composer.dropFiles')}</span>
          </div>
        )}
      </div>
    </RegisterReceiver.Provider>
  )
}

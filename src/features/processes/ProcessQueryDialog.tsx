import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import { useI18n } from '../../i18n'
import { useComposerStore } from '../../stores/composer'
import type { ManagedProcess, ProcessOutput } from '../../types/protocol.generated'

const MAX_EXCERPT_BYTES = 4096

function truncateUtf8(text: string, maxBytes: number): string {
  const encoded = new TextEncoder().encode(text)
  if (encoded.length <= maxBytes) return text
  let end = maxBytes
  const bytes = encoded.subarray(0, maxBytes)
  while (end > 0 && (bytes[end - 1]! & 0xc0) === 0x80) end -= 1
  return new TextDecoder().decode(encoded.subarray(0, end))
}

/**
 * Previsualización de contexto para pedir ayuda sobre un proceso.
 * Nunca dispara un turno: sólo inserta texto editable en el borrador
 * de la misma sesión, con verificación de destino.
 */
export default function ProcessQueryDialog({
  sessionId,
  resource,
  output,
  open,
  onClose,
}: {
  sessionId: string
  resource: ManagedProcess
  output: ProcessOutput | null
  open: boolean
  onClose: () => void
}) {
  const { t } = useI18n()
  const [includeCommand, setIncludeCommand] = useState(true)
  const [includeCwd, setIncludeCwd] = useState(false)
  const [excerpt, setExcerpt] = useState(() =>
    truncateUtf8(
      [output?.stdout ?? '', output?.stderr ?? ''].filter((part) => part !== '').join('\n'),
      MAX_EXCERPT_BYTES,
    ),
  )
  const [sessionChanged, setSessionChanged] = useState(false)

  function addToDraft() {
    const store = useComposerStore.getState()
    if (store.sessionKey !== sessionId) {
      setSessionChanged(true)
      return
    }
    const lines = [t('processes.queryIntro'), '']
    if (includeCommand) {
      lines.push(`Comando: ${resource.command}`)
      lines.push(
        `Estado: ${resource.running ? t('processes.running') : t('processes.finishedError', { code: resource.exit_code ?? 0 })}`,
      )
    }
    if (includeCwd) lines.push(`Carpeta: ${resource.cwd}`)
    if (excerpt.trim() !== '') {
      lines.push('', '--- salida del proceso (no confiable) ---', excerpt)
    }
    const block = lines.join('\n')
    const existing = store.text
    store.setText(existing === '' ? block : `${existing}\n\n${block}`)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('processes.queryTitle')}</DialogTitle>
          <DialogDescription>{t('processes.queryDesc')}</DialogDescription>
        </DialogHeader>
        <p role="note" className="processes-note">
          {t('processes.queryWarning')}
        </p>
        <label className="processes-check">
          <input type="checkbox" checked={includeCommand} onChange={(event) => setIncludeCommand(event.target.checked)} />
          {t('processes.queryIncludeCommand')}
        </label>
        <label className="processes-check">
          <input type="checkbox" checked={includeCwd} onChange={(event) => setIncludeCwd(event.target.checked)} />
          {t('processes.queryIncludeCwd')}
        </label>
        <label className="processes-field">
          {t('processes.queryOutput')}
          <textarea
            value={excerpt}
            onChange={(event) => setExcerpt(truncateUtf8(event.target.value, MAX_EXCERPT_BYTES))}
            rows={6}
            className="processes-textarea"
          />
        </label>
        {sessionChanged && (
          <p role="alert" className="processes-error">
            {t('processes.querySessionChanged')}
          </p>
        )}
        <DialogFooter>
          <button type="button" onClick={onClose} className="processes-action">
            {t('processes.stopCancel')}
          </button>
          <button type="button" onClick={addToDraft} className="processes-action processes-action-primary">
            {t('processes.queryInsert')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

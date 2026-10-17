import { useState } from 'react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { platform } from '../../platform'
import { commandMessage } from '../../services/engine'
import { useConfirm } from '../ui/useConfirm'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * «Exportar diagnóstico» (vive en Ajustes → Avanzado, #96): lo que lleva el
 * paquete se ve antes de guardarlo y nada se envía desde aquí. `dialog` se
 * monta una vez junto al botón.
 */
export function useDiagnosticsExport() {
  const { t } = useI18n()
  const { ask, dialog } = useConfirm()
  const [exporting, setExporting] = useState(false)
  const run = async () => {
    setExporting(true)
    try {
      const preview = await platform().diagnostics.preview()
      const ok = await ask({
        title: t('settings.about.exportTitle'),
        body: (
          <span className="block space-y-3">
            <span className="block">{t('settings.about.exportBody')}</span>
            <span className="block max-h-48 overflow-auto rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-xs">
              {preview.files.map((file) => (
                <span key={file.name} className="flex justify-between gap-4">
                  <span className="min-w-0 truncate">{file.name}</span>
                  {file.bytes !== null && <span className="shrink-0 tabular-nums">{formatBytes(file.bytes)}</span>}
                </span>
              ))}
            </span>
          </span>
        ),
        confirmLabel: t('settings.about.exportConfirm'),
        cancelLabel: t('common.cancel'),
      })
      if (!ok) return
      const result = await platform().diagnostics.export()
      if (result.saved) toast.success(t('settings.about.exportSaved'))
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setExporting(false)
    }
  }
  return { exporting, run, dialog }
}

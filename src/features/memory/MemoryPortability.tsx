import { useState } from 'react'
import { Download, LoaderCircle, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n, type I18nKey } from '../../i18n'
import { Button } from '../../components/ui/button'
import { useConfirm } from '../../components/ui/useConfirm'
import { Section } from '../../components/settings/parts'
import { platform } from '../../platform'
import { isCommandError } from '../../services/engine'
import { memoryApi } from '../../services/memory'
import { refreshMemory } from './memoryStore'
import { memoryErrorMessage } from './memoryCopy'
import type { MemoryImportSummary } from './types'

type Translate = (key: I18nKey, vars?: Record<string, string | number>) => string

/** El archivo guarda lo que devolvió `memory.export`: el paquete y su digest. */
function parseExport(contents: string): { bundle: Record<string, unknown>; digest: string } | null {
  try {
    const value = JSON.parse(contents) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const { bundle, digest } = value as Record<string, unknown>
    if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle) || typeof digest !== 'string') return null
    return { bundle: bundle as Record<string, unknown>, digest }
  } catch {
    return null
  }
}

function fileName(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `rinari-memory-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`
}

/** Fallo de exportar o importar en palabras de la persona. */
function portabilityError(error: unknown, t: Translate): string {
  if (isCommandError(error)) {
    if (error.code === 'FILE_TOO_LARGE') return t('memory.import.tooLarge')
    if (error.code === 'INVALID_FILE') return t('memory.import.invalid')
    // El Engine responde INVALID_PARAMS para todo paquete que rechaza; el
    // digest es el caso que la persona puede entender: el archivo cambió.
    if (error.code === 'INVALID_PARAMS') {
      return /digest/i.test(error.message) ? t('memory.import.tampered') : t('memory.import.invalid')
    }
  }
  return memoryErrorMessage(error, t)
}

const SKIPPED: Array<[keyof MemoryImportSummary, I18nKey]> = [
  ['skipped_duplicates', 'memory.import.summary.duplicates'],
  ['skipped_suppressed', 'memory.import.summary.suppressed'],
  ['skipped_conflicts', 'memory.import.summary.conflicts'],
  ['rejected', 'memory.import.summary.rejected'],
]

function SummaryLines({ summary }: { summary: MemoryImportSummary }) {
  const { t } = useI18n()
  return (
    <span className="block space-y-1" data-testid="memory-import-summary">
      <span className="block font-medium text-[var(--text)]">{t('memory.import.summary.new', { count: summary.imported })}</span>
      {summary.sensitive > 0 && <span className="block">{t('memory.import.summary.sensitive', { count: summary.sensitive })}</span>}
      {SKIPPED.filter(([key]) => Number(summary[key]) > 0).map(([key, label]) => (
        <span key={key} className="block">{t(label, { count: Number(summary[key]) })}</span>
      ))}
      <span className="block pt-1 text-xs text-[var(--text-subtle)]">{t('memory.import.note')}</span>
    </span>
  )
}

/**
 * Exportar e importar la memoria. El archivo lo arma y lo valida el Engine;
 * aquí solo se elige dónde guardarlo o cuál abrir (diálogo nativo) y, antes de
 * importar, se muestra a la persona qué entraría y qué no.
 */
export function MemoryPortability() {
  const { t } = useI18n()
  const { ask, dialog } = useConfirm()
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)

  async function exportMemory() {
    setBusy('export')
    try {
      const exported = await memoryApi.exportBundle()
      const contents = `${JSON.stringify({ bundle: exported.bundle, digest: exported.digest }, null, 2)}\n`
      const result = await platform().dialog.saveJson({
        suggestedName: fileName(),
        contents,
        title: t('memory.export.saveTitle'),
      })
      if (result.saved) toast.success(t('memory.export.done', { name: result.name ?? fileName() }))
    } catch (error) {
      toast.error(portabilityError(error, t))
    } finally {
      setBusy(null)
    }
  }

  async function importMemory() {
    setBusy('import')
    try {
      const file = await platform().dialog.openJson({ title: t('memory.import.openTitle') })
      if (!file) return
      const parsed = parseExport(file.contents)
      if (!parsed) {
        toast.error(t('memory.import.invalid'))
        return
      }
      const preview = await memoryApi.importBundle(parsed.bundle, parsed.digest, true)
      if (preview.imported === 0) {
        toast.info(t('memory.import.nothing', { name: file.name }), { description: <SummaryLines summary={preview} /> })
        return
      }
      const confirmed = await ask({
        title: t('memory.import.title', { name: file.name }),
        body: <SummaryLines summary={preview} />,
        confirmLabel: t('memory.import.confirm'),
        cancelLabel: t('memory.cancel'),
      })
      if (!confirmed) return
      const done = await memoryApi.importBundle(parsed.bundle, parsed.digest, false)
      toast.success(t('memory.import.done', { count: done.imported }))
      void refreshMemory()
    } catch (error) {
      toast.error(portabilityError(error, t))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Section title={t('memory.portability.title')} desc={t('memory.portability.desc')} anchor="memory-portability">
      {dialog}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void exportMemory()}>
          {busy === 'export' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
          {t('memory.export')}
        </Button>
        <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void importMemory()}>
          {busy === 'import' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
          {t('memory.import')}
        </Button>
      </div>
    </Section>
  )
}

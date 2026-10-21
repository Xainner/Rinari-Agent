import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { LoaderCircle, RotateCcw } from 'lucide-react'
import { commandMessage, engineApi, type McpImportCandidate, type McpImportResult, type McpImportSource } from '../../services/engine'
import { hasTranslation, useI18n, type I18nKey } from '../../i18n'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { ProgressBar } from '../../components/ui/progress-bar'
import { SegTabPanel, SegTabs } from './SegTabs'

type Mode = 'apps' | 'paste'

/** Una advertencia del Engine en lenguaje llano (`unresolved_variable:env.X` → «… X»). */
export function warningText(t: (key: I18nKey, vars?: Record<string, string | number>) => string, warning: string): string {
  const [code, field] = warning.split(':', 2)
  const key = `connectors.import.warning.${code}`
  return hasTranslation(key) ? t(key, { field: field ?? '' }) : warning
}

export function reasonText(t: (key: I18nKey) => string, reason: string | null | undefined): string {
  const key = `connectors.import.reason.${reason ?? ''}`
  return reason && hasTranslation(key) ? t(key) : t('connectors.import.reason.unknown')
}

/** Por qué no se creó un servidor, en llano; el mensaje del Engine queda en «Detalles». */
export function failureText(t: (key: I18nKey) => string, code: string | null | undefined): string {
  const key = `connectors.import.failed.${code ?? ''}`
  return code && hasTranslation(key) ? t(key) : t('connectors.import.failed.unknown')
}

export function FailureDetails({ message }: { message?: string | null }) {
  const { t } = useI18n()
  if (!message) return null
  return <details className="mt-1 text-[11.5px] text-[var(--text-subtle)]"><summary className="cursor-pointer">{t('connectors.details')}</summary><p className="mt-1 break-words font-mono">{message}</p></details>
}

/** Qué trae un candidato: el programa o la URL, y los nombres (nunca los valores) de sus secretos. */
export function CandidateBody({ candidate }: { candidate: McpImportCandidate }) {
  const { t } = useI18n()
  const where = candidate.transport === 'http' ? candidate.url : candidate.command.join(' ')
  return (
    <>
      {where && <p className="truncate font-mono text-[11.5px] text-[var(--text-subtle)]" title={where}>{where}</p>}
      {candidate.secrets.length > 0 && (
        <p className="text-[12px] text-[var(--text-muted)]">{t('connectors.import.secrets', { names: candidate.secrets.map((secret) => secret.name).join(', ') })}</p>
      )}
      {candidate.warnings.map((warning) => <p key={warning} className="text-[12px] text-[var(--warning)]">{warningText(t, warning)}</p>)}
      {!candidate.importable && <p className="text-[12px] text-[var(--danger)]">{reasonText(t, candidate.reason)}</p>}
    </>
  )
}

/**
 * «Importar de otra app» y «Pegar JSON» (C4): Rinari lee las
 * configuraciones de Claude Desktop, Claude Code, Cursor, VS Code y Codex, o
 * un `mcpServers` pegado, y muestra una lista para marcar. Nada se importa
 * sin marcar; los secretos que traen van al almacén y aquí solo se ven sus
 * nombres.
 */
export function ImportDialog({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const { t } = useI18n()
  const [mode, setMode] = useState<Mode>('apps')
  const [json, setJson] = useState('')
  const [scan, setScan] = useState<{ mode: Mode; sources: McpImportSource[]; candidates: McpImportCandidate[]; json?: string } | null>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [marked, setMarked] = useState<Set<string>>(new Set())
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<McpImportResult | null>(null)
  // Cada lectura lleva su número: la respuesta de una vieja (o de la otra pestaña) se ignora.
  const scanSeq = useRef(0)

  async function runScan(pasted?: string) {
    const id = ++scanSeq.current
    const tab: Mode = pasted === undefined ? 'apps' : 'paste'
    setScanning(true)
    setError(null)
    setResult(null)
    setMarked(new Set())
    try {
      const found = await engineApi.mcpImportScan(pasted === undefined ? {} : { json: pasted })
      if (id === scanSeq.current) setScan({ ...found, mode: tab, json: pasted })
    } catch (err) {
      if (id !== scanSeq.current) return
      setScan(null)
      setError(commandMessage(err))
    } finally {
      if (id === scanSeq.current) setScanning(false)
    }
  }

  useEffect(() => {
    if (!open) {
      // El JSON pegado puede traer secretos: no se queda en memoria con el diálogo cerrado.
      scanSeq.current += 1
      setJson('')
      setScan(null)
      return
    }
    setMode('apps')
    setJson('')
    setScan(null)
    setResult(null)
    void runScan()
  }, [open])

  function switchMode(next: Mode) {
    scanSeq.current += 1
    setScanning(false)
    setMode(next)
    setScan(null)
    setError(null)
    setResult(null)
    setMarked(new Set())
    if (next === 'apps') void runScan()
  }

  async function apply() {
    // Solo lo marcado de la última lectura de esta pestaña (y un JSON ya importado no se reusa).
    if (!scan || scan.mode !== mode || scanning || (scan.mode === 'paste' && !scan.json)) return
    const chosen = scan.candidates.filter((candidate) => marked.has(candidate.key))
    if (chosen.length === 0) return
    const id = scanSeq.current
    setApplying(true)
    try {
      const keys = chosen.map((candidate) => candidate.key)
      const names = Object.fromEntries(chosen.filter((candidate) => candidate.suggested_name && candidate.suggested_name !== candidate.name).map((candidate) => [candidate.key, candidate.suggested_name as string]))
      const applied = await engineApi.mcpImportApply({ keys, names: Object.keys(names).length ? names : undefined, json: scan.json })
      if (id === scanSeq.current) setResult(applied)
      setMarked(new Set())
      // Importado todo lo marcado: el JSON pegado (puede traer secretos) se borra.
      if (scan.mode === 'paste' && applied.failed.length === 0 && applied.created.length > 0) {
        setJson('')
        if (id === scanSeq.current) setScan((current) => (current ? { ...current, json: undefined } : current))
      }
      if (applied.created.length > 0) {
        toast.success(t('connectors.import.done', { n: applied.created.length }))
        onImported()
      }
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setApplying(false)
    }
  }

  const toggle = (key: string) => setMarked((current) => {
    const next = new Set(current)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })
  const created = new Set(result?.created.map((item) => item.key) ?? [])
  const failed = new Map(result?.failed.map((item) => [item.key, item]) ?? [])

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-w-2xl" data-testid="connector-import">
        <DialogHeader>
          <DialogTitle>{t('connectors.import.title')}</DialogTitle>
          <DialogDescription>{t('connectors.import.intro')}</DialogDescription>
        </DialogHeader>
        <SegTabs<Mode>
          value={mode}
          label={t('connectors.import.title')}
          idPrefix="import"
          options={(['apps', 'paste'] as const).map((value) => ({ value, label: t(`connectors.import.mode.${value}` as I18nKey) }))}
          onChange={switchMode}
        />

        <SegTabPanel idPrefix="import" value={mode} className="grid grid-cols-[minmax(0,1fr)] gap-4">
          {mode === 'paste' && (
            <div className="space-y-2">
              <label className="field-label mt-0" htmlFor="import-json">{t('connectors.import.jsonLabel')}</label>
              <textarea id="import-json" className="field-input min-h-[140px] font-mono text-[12px]" value={json} onChange={(event) => setJson(event.target.value)} spellCheck={false} placeholder={'{ "mcpServers": { … } }'} />
              <p className="field-hint">{t('connectors.import.jsonHint')}</p>
              <button type="button" className="btn btn-secondary btn-sm" disabled={!json.trim() || scanning} onClick={() => void runScan(json)}>{scanning && <LoaderCircle size={13} className="r-spin" />} {t('connectors.import.read')}</button>
            </div>
          )}

          {scanning && mode === 'apps' && <ProgressBar label={t('connectors.import.scanning')} />}
          {error && <p role="alert" className="text-[13px] text-[var(--danger)]">{error}</p>}

          {scan && mode === 'apps' && (
            <ul className="import-sources" aria-label={t('connectors.import.sources')}>
              {scan.sources.map((source) => (
                <li key={`${source.source}:${source.path}`} data-found={source.found || undefined}>
                  <span className="text-[12.5px] text-[var(--text)]">{source.label ?? source.source}</span>
                  <span className="text-[12px] text-[var(--text-muted)]">
                    {source.error ? t(`connectors.import.sourceError.${source.error}` as I18nKey) : source.found ? t('connectors.import.sourceFound', { n: source.servers }) : t('connectors.import.sourceMissing')}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {scan && scan.candidates.length === 0 && <p className="text-[13px] text-[var(--text-muted)]">{t(mode === 'apps' ? 'connectors.import.noneFound' : 'connectors.import.nonePasted')}</p>}

          {scan && scan.candidates.length > 0 && (
            <ul className="import-list" aria-label={t('connectors.import.candidates')}>
              {scan.candidates.map((candidate) => {
                const id = `import-${candidate.key}`
                const done = created.has(candidate.key)
                const fail = failed.get(candidate.key)
                return (
                  <li key={candidate.key} className="import-item" data-key={candidate.key} data-importable={candidate.importable || undefined}>
                    <input id={id} type="checkbox" className="r-checkbox" checked={marked.has(candidate.key)} disabled={!candidate.importable || done || applying || scanning || (scan.mode === 'paste' && !scan.json)} onChange={() => toggle(candidate.key)} />
                    <div className="min-w-0 flex-1">
                      <label htmlFor={id} className="flex flex-wrap items-center gap-2">
                        <b className="text-[13px] text-[var(--text)]">{candidate.suggested_name ?? candidate.name}</b>
                        <span className="mcp-chip">{t(candidate.transport === 'http' ? 'connectors.chip.remote' : 'connectors.chip.local')}</span>
                        {candidate.source_label && <span className="text-[11.5px] text-[var(--text-subtle)]">{candidate.source_label}</span>}
                        {candidate.project_root && <span className="mcp-chip">{t('connectors.chip.project')}</span>}
                      </label>
                      <CandidateBody candidate={candidate} />
                      {candidate.existing && <p className="text-[12px] text-[var(--text-muted)]">{t('connectors.import.existing', { name: candidate.existing })}</p>}
                      {done && <p className="text-[12px] text-[var(--success)]" role="status">{t('connectors.import.created')}</p>}
                      {fail && (
                        <div role="alert">
                          <p className="text-[12px] text-[var(--danger)]">{failureText(t, fail.code)}</p>
                          <FailureDetails message={fail.message} />
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {scan && scan.mode === 'paste' && !scan.json && scan.candidates.some((candidate) => candidate.importable && !created.has(candidate.key)) && (
            <p className="field-hint">{t('connectors.import.pasteAgain')}</p>
          )}
        </SegTabPanel>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {mode === 'apps' && <button type="button" className="btn btn-quiet btn-sm mr-auto" disabled={scanning} onClick={() => void runScan()}><RotateCcw size={13} /> {t('connectors.import.rescan')}</button>}
          <button type="button" className="btn btn-primary" disabled={marked.size === 0 || applying || scanning} onClick={() => void apply()} data-testid="import-apply">
            {applying && <LoaderCircle size={14} className="r-spin" />} {t('connectors.import.apply', { n: marked.size })}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

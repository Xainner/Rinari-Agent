import { useCallback, useEffect, useRef, useState } from 'react'
import { commandMessage } from '../../services/engine'
import { platform } from '../../platform'
import {
  ACTIVE_JOB,
  documentsApi,
  type DocumentInspectionResult,
  type DocumentJob,
  type DocumentPreview,
} from './documentsApi'

export interface DocumentSource {
  sessionId: string
  /** `artifact://…` o una revisión (`rev_…`). */
  ref?: string
  /** Archivo del workspace: se importa con la autorización de `workspace.file.*`. */
  path?: string
  turnId?: string
}

export interface DocumentState {
  loading: boolean
  error?: string
  inspection?: DocumentInspectionResult
  preview?: DocumentPreview | null
  job?: DocumentJob
  /** Por qué no hay vista previa (sin Office ni LibreOffice…). */
  unavailable?: { code: string; message: string; action?: string }
  rerender: () => void
  cancel: () => void
}

/**
 * Un documento en el escritorio: su revisión, la inspección y la vista previa
 * que el Engine renderizó para esa revisión exacta. Si no hay preview, se pide
 * un render y se sigue su trabajo por `document.job.updated`; al reconectar o
 * si un evento se pierde, `documents.job.get` reconcilia.
 */
export function useDocument(source: DocumentSource): DocumentState {
  const { sessionId, ref, path, turnId } = source
  const [state, setState] = useState<Omit<DocumentState, 'rerender' | 'cancel'>>({ loading: true })
  const jobRef = useRef<string | null>(null)
  const generation = useRef(0)

  const follow = useCallback((job: DocumentJob, current: number) => {
    jobRef.current = job.job_id
    const apply = (next: DocumentJob) => {
      if (generation.current !== current || next.job_id !== jobRef.current) return
      setState((previous) => {
        const done = !ACTIVE_JOB.has(next.status)
        const preview = done && next.result?.pages
          ? { revision_id: next.result.revision_id ?? '', backend: next.result.backend ?? null, pdf_uri: next.result.pdf_uri ?? null, pages: next.result.pages }
          : previous.preview
        const unavailable = next.status === 'failed' && next.error
          ? { code: next.error.code, message: next.error.message, action: next.error.action }
          : previous.unavailable
        return { ...previous, job: next, preview, unavailable }
      })
    }
    apply(job)
    return apply
  }, [])

  const start = useCallback(async (ref: string, current: number, onUpdate: (apply: (job: DocumentJob) => void) => void) => {
    try {
      const job = await documentsApi.render(sessionId, ref)
      onUpdate(follow(job, current))
    } catch (error) {
      if (generation.current !== current) return
      const code = (error as { code?: string }).code ?? 'RENDER_FAILED'
      setState((previous) => ({ ...previous, unavailable: { code, message: commandMessage(error) } }))
    }
  }, [follow, sessionId])

  const load = useCallback(async (forceRender = false) => {
    const current = ++generation.current
    jobRef.current = null
    setState({ loading: true })
    let apply: ((job: DocumentJob) => void) | null = null
    try {
      let documentRef = ref
      if (!documentRef && path) documentRef = (await documentsApi.importFile(sessionId, path, turnId)).revision.id
      if (!documentRef) throw new Error('No document')
      const inspection = await documentsApi.inspect(sessionId, documentRef)
      if (generation.current !== current) return
      const revisionId = inspection.revision.id
      const { preview } = await documentsApi.preview(sessionId, revisionId)
      if (generation.current !== current) return
      setState({ loading: false, inspection, preview })
      if (forceRender || !preview || preview.pages.length === 0) {
        await start(revisionId, current, (next) => { apply = next })
      }
    } catch (error) {
      if (generation.current !== current) return
      setState({ loading: false, error: commandMessage(error) })
    }
    return apply
  }, [path, ref, sessionId, start, turnId])

  useEffect(() => {
    let disposed = false
    let stop: (() => void) | undefined
    void platform().events.onEngineEvent((message) => {
      if (message.event !== 'document.job.updated') return
      const job = message.payload as unknown as DocumentJob
      if (job.session_id !== sessionId || job.job_id !== jobRef.current) return
      const current = generation.current
      follow(job, current)
    }).then((unsubscribe) => { if (disposed) unsubscribe(); else stop = unsubscribe })
    void load()
    // Reconciliación: un evento perdido no deja el trabajo «en curso» para siempre.
    const timer = window.setInterval(() => {
      const jobId = jobRef.current
      if (!jobId) return
      const current = generation.current
      void documentsApi.job(sessionId, jobId).then((job) => {
        if (ACTIVE_JOB.has(job.status)) return
        follow(job, current)
        jobRef.current = null
      }).catch(() => undefined)
    }, 4000)
    return () => { disposed = true; stop?.(); window.clearInterval(timer); generation.current += 1 }
  }, [follow, load, sessionId])

  return {
    ...state,
    rerender: () => { void load(true) },
    cancel: () => {
      const jobId = jobRef.current
      if (jobId) void documentsApi.cancel(sessionId, jobId).catch(() => undefined)
    },
  }
}

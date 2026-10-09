import { engineApi, onEngineEvent } from '../../services/engine'
import { toBase64 } from './wav'

/** A long recording on a slow CPU; past this the composer stops waiting. */
const TRANSCRIBE_TIMEOUT_MS = 180_000

export class DictationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
  }
}

/**
 * Sends a WAV to the Engine and waits for its text. The Engine answers with a
 * job at once and the result arrives as `speech.transcribed` / `speech.failed`
 * with that job id, so turns keep streaming meanwhile.
 */
export async function transcribe(wav: Uint8Array, language?: string): Promise<string> {
  let jobId: string | null = null
  const early: Array<{ event: string; payload: Record<string, unknown> }> = []
  let settle: ((value: string) => void) | null = null
  let fail: ((error: DictationError) => void) | null = null
  const handle = (event: string, payload: Record<string, unknown>) => {
    if (payload.job_id !== jobId) return
    if (event === 'speech.transcribed') settle?.(typeof payload.text === 'string' ? payload.text : '')
    else if (event === 'speech.failed') {
      const error = (payload.error ?? {}) as { code?: string; message?: string }
      fail?.(new DictationError(error.code ?? 'TRANSCRIBE_FAILED', error.message ?? 'transcription failed'))
    }
  }
  // Subscribed before the request: a fast result must not arrive unheard.
  const unsubscribe = await onEngineEvent(({ event, payload }) => {
    if (event !== 'speech.transcribed' && event !== 'speech.failed') return
    if (jobId === null) early.push({ event, payload })
    else handle(event, payload)
  })
  try {
    const result = new Promise<string>((resolve, reject) => {
      settle = resolve
      fail = reject
    })
    jobId = (await engineApi.speechTranscribe(toBase64(wav), language)).job_id
    for (const item of early.splice(0)) handle(item.event, item.payload)
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new DictationError('TIMEOUT', 'transcription timed out')), TRANSCRIBE_TIMEOUT_MS)
    })
    try {
      return await Promise.race([result, timeout])
    } finally {
      clearTimeout(timer)
    }
  } finally {
    unsubscribe()
  }
}

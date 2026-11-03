import { useCallback, useEffect, useRef, useState } from 'react'
import { startRecording, type Recording } from './recorder'
import { DictationError, transcribe } from './transcribe'

export type DictationState = 'idle' | 'starting' | 'recording' | 'transcribing'

/** Shorter than this is a slip of the shortcut, not dictation. */
const MIN_RECORDING_MS = 300
/** Below this peak level (RMS) the recording is room noise, not speech. */
const SILENCE_RMS = 0.008

/**
 * Record, then transcribe on stop. `onText` receives what was said; errors go
 * to `onError` with a stable code the composer turns into words.
 */
export function useDictation({
  language,
  onText,
  onError,
}: {
  language?: string
  onText: (text: string) => void
  onError: (code: string) => void
}) {
  const [state, setState] = useState<DictationState>('idle')
  const [level, setLevel] = useState(0)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const recording = useRef<Recording | null>(null)
  const startedRef = useRef(0)
  const pendingStop = useRef(false)
  const pendingCancel = useRef(false)
  const callbacks = useRef({ onText, onError, language })
  callbacks.current = { onText, onError, language }

  const stop = useCallback(async () => {
    const active = recording.current
    if (!active) {
      // Released before the microphone opened: stop as soon as it does.
      pendingStop.current = true
      return
    }
    recording.current = null
    setStartedAt(null)
    setLevel(0)
    if (Date.now() - startedRef.current < MIN_RECORDING_MS) {
      active.cancel()
      setState('idle')
      return
    }
    // Silence is not sent: Whisper fills it with an invented phrase.
    if (active.loudest() < SILENCE_RMS) {
      active.cancel()
      setState('idle')
      callbacks.current.onError('EMPTY')
      return
    }
    setState('transcribing')
    try {
      const wav = await active.stop()
      const text = (await transcribe(wav, callbacks.current.language)).trim()
      if (text) callbacks.current.onText(text)
      else callbacks.current.onError('EMPTY')
    } catch (error) {
      callbacks.current.onError(error instanceof DictationError ? error.code : 'TRANSCRIBE_FAILED')
    } finally {
      setState('idle')
    }
  }, [])

  const start = useCallback(async () => {
    if (recording.current || state !== 'idle') return
    pendingStop.current = false
    pendingCancel.current = false
    setState('starting')
    try {
      recording.current = await startRecording(setLevel)
      if (pendingCancel.current) {
        recording.current.cancel()
        recording.current = null
        setState('idle')
        return
      }
    } catch (error) {
      setState('idle')
      const name = error instanceof DOMException ? error.name : ''
      callbacks.current.onError(name === 'NotAllowedError' ? 'MIC_DENIED' : name === 'NotFoundError' ? 'MIC_MISSING' : 'MIC_FAILED')
      return
    }
    startedRef.current = Date.now()
    setStartedAt(startedRef.current)
    setState('recording')
    if (pendingStop.current) void stop()
  }, [state, stop])

  const cancel = useCallback(() => {
    // Still opening the microphone: start() drops it as soon as it opens.
    pendingCancel.current = true
    recording.current?.cancel()
    recording.current = null
    setStartedAt(null)
    setLevel(0)
    setState('idle')
  }, [])

  // Never leave the microphone open behind an unmounted composer.
  useEffect(() => () => recording.current?.cancel(), [])

  return { state, level, startedAt, start, stop, cancel }
}

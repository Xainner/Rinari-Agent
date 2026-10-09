import { DICTATION_SAMPLE_RATE, encodeWav, resample, rms } from './wav'

export interface Recording {
  /** Stops the microphone and returns the WAV (mono, 16 kHz, 16-bit). */
  stop: () => Promise<Uint8Array>
  /** Stops the microphone and drops what was recorded. */
  cancel: () => void
}

/**
 * Microphone capture for dictation. The track is stopped on stop or cancel,
 * so the system's «microphone in use» indicator goes away with it.
 */
export async function startRecording(onLevel?: (level: number) => void): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false,
  })
  const context = new AudioContext({ sampleRate: DICTATION_SAMPLE_RATE })
  const source = context.createMediaStreamSource(stream)
  // ScriptProcessor keeps this to one file (an AudioWorklet needs its own
  // module under the app's CSP); a few seconds of mono audio is no load.
  const processor = context.createScriptProcessor(4096, 1, 1)
  const blocks: Float32Array[] = []
  processor.onaudioprocess = (event) => {
    const block = new Float32Array(event.inputBuffer.getChannelData(0))
    blocks.push(block)
    onLevel?.(rms(block))
  }
  source.connect(processor)
  processor.connect(context.destination)

  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    processor.disconnect()
    source.disconnect()
    stream.getTracks().forEach((track) => track.stop())
    void context.close()
  }

  return {
    stop: async () => {
      const rate = context.sampleRate
      close()
      const total = blocks.reduce((sum, block) => sum + block.length, 0)
      const samples = new Float32Array(total)
      let offset = 0
      for (const block of blocks) {
        samples.set(block, offset)
        offset += block.length
      }
      return encodeWav(resample(samples, rate))
    },
    cancel: close,
  }
}

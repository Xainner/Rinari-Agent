/** Sample rate whisper.cpp expects; the Engine refuses anything else. */
export const DICTATION_SAMPLE_RATE = 16000

/**
 * Linear resample. Chromium usually honours `new AudioContext({ sampleRate })`
 * and this is a no-op, but a device that cannot run at 16 kHz still records.
 */
export function resample(input: Float32Array, fromRate: number, toRate = DICTATION_SAMPLE_RATE): Float32Array {
  if (fromRate === toRate || input.length === 0) return input
  const ratio = fromRate / toRate
  const length = Math.max(1, Math.floor(input.length / ratio))
  const output = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    const position = i * ratio
    const left = Math.floor(position)
    const right = Math.min(left + 1, input.length - 1)
    const weight = position - left
    output[i] = input[left] * (1 - weight) + input[right] * weight
  }
  return output
}

/** Mono 16-bit PCM WAV, the format the Engine checks before transcribing. */
export function encodeWav(samples: Float32Array, sampleRate = DICTATION_SAMPLE_RATE): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(bytes.buffer)
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
  }
  return bytes
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** Root mean square of a block, 0–1: what the level meter shows. */
export function rms(block: Float32Array): number {
  if (block.length === 0) return 0
  let sum = 0
  for (const sample of block) sum += sample * sample
  return Math.min(1, Math.sqrt(sum / block.length))
}

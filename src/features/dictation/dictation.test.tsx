// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { I18nProvider } from '../../i18n'
import { setPlatformForTests } from '../../platform'
import { createTestBridge, type TestBridge } from '../../platform/testBridge'
import type { SpeechStatus } from '../../services/engine'
import DictationSettings from './DictationSettings'
import { useDictationPrefs } from './dictationPrefs'
import { transcribe } from './transcribe'
import { encodeWav, resample, rms, toBase64 } from './wav'

const status: SpeechStatus = {
  model: 'small', language: '', vocabulary: 'Boards', binary_found: true, model_installed: false, ready: false,
  models: [
    { id: 'base', file: 'ggml-base-q5_1.bin', size: 59_707_625, tier: 'light', installed: false },
    { id: 'small', file: 'ggml-small-q5_1.bin', size: 190_085_487, tier: 'default', installed: false },
    { id: 'large-v3-turbo', file: 'x.bin', size: 574_041_195, tier: 'best', installed: true },
  ],
  languages: ['auto', 'es', 'en'],
}

let bridge: TestBridge
let restore: () => void
beforeEach(() => {
  bridge = createTestBridge()
  restore = setPlatformForTests(bridge)
})
afterEach(() => {
  cleanup()
  restore()
  useDictationPrefs.setState({ sendOnFinish: false })
})

describe('WAV que acepta el Engine', () => {
  it('codifica mono, 16 kHz, 16 bits, con la cabecera correcta', () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 0.5]))
    const view = new DataView(wav.buffer)
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF')
    expect(String.fromCharCode(...wav.subarray(8, 12))).toBe('WAVE')
    expect(view.getUint16(22, true)).toBe(1) // mono
    expect(view.getUint32(24, true)).toBe(16000)
    expect(view.getUint16(34, true)).toBe(16) // bits
    expect(view.getUint32(40, true)).toBe(8) // 4 samples x 2 bytes
    expect(view.getInt16(46, true)).toBe(32767)
    expect(view.getInt16(48, true)).toBe(-32768)
  })

  it('remuestrea a 16 kHz cuando el dispositivo no puede', () => {
    expect(resample(new Float32Array(48000), 48000).length).toBe(16000)
    const same = new Float32Array(10)
    expect(resample(same, 16000)).toBe(same)
  })

  it('mide el nivel y pasa a base64', () => {
    expect(rms(new Float32Array([0.5, -0.5]))).toBeCloseTo(0.5)
    expect(toBase64(new Uint8Array([82, 73, 70, 70]))).toBe('UklGRg==')
  })
})

describe('transcripción como job del Engine', () => {
  it('envía el WAV y espera speech.transcribed con su job_id, ignorando otros', async () => {
    bridge.mockCommand('speech_transcribe', () => {
      // Another job finishes first, then ours.
      setTimeout(() => {
        bridge.emitEngineEvent({ type: 'event', event: 'speech.transcribed', payload: { job_id: 'job_otro', text: 'no' } })
        bridge.emitEngineEvent({ type: 'event', event: 'speech.transcribed', payload: { job_id: 'job_1', text: 'Hola Rinari' } })
      }, 0)
      return { job_id: 'job_1', status: 'running' }
    })
    await expect(transcribe(encodeWav(new Float32Array(16000)), 'es')).resolves.toBe('Hola Rinari')
    const [call] = bridge.calls.filter((c) => c.name === 'speech_transcribe')
    expect(call.args.language).toBe('es')
    expect(typeof call.args.audio).toBe('string')
  })

  it('un fallo del Engine llega con su código', async () => {
    bridge.mockCommand('speech_transcribe', () => {
      setTimeout(() => bridge.emitEngineEvent({ type: 'event', event: 'speech.failed', payload: { job_id: 'job_2', error: { code: 'MODEL_MISSING', message: 'x' } } }), 0)
      return { job_id: 'job_2', status: 'running' }
    })
    await expect(transcribe(encodeWav(new Float32Array(16000)))).rejects.toMatchObject({ code: 'MODEL_MISSING' })
  })
})

describe('Ajustes › Dictado', () => {
  it('muestra los modelos, descarga el elegido y guarda idioma y vocabulario en el Engine', async () => {
    bridge.mockCommand('speech_status', () => status)
    bridge.mockCommand('speech_model_download', (args) => ({ model: args.model, status: 'running' }))
    bridge.mockCommand('speech_settings_set', (args) => ({ ...status, ...args }))
    render(<I18nProvider lang="es"><DictationSettings /></I18nProvider>)
    const panel = await screen.findByTestId('dictation-settings')
    expect(within(panel).getByRole('radio', { name: /small/ }).getAttribute('aria-checked')).toBe('true')
    expect(within(panel).getByText('Descargado')).toBeTruthy() // large-v3-turbo
    await userEvent.click(within(panel).getAllByRole('button', { name: 'Descargar' })[1])
    await waitFor(() => expect(bridge.calls.filter((c) => c.name === 'speech_model_download').map((c) => c.args)).toEqual([{ model: 'small' }]))
    await userEvent.selectOptions(within(panel).getByLabelText('Idioma'), 'es')
    await waitFor(() => expect(bridge.calls.some((c) => c.name === 'speech_settings_set' && c.args.language === 'es')).toBe(true))
    expect((within(panel).getByLabelText('Vocabulario') as HTMLInputElement).value).toBe('Boards')
  })

  it('«Enviar al terminar» está apagado por defecto y se recuerda', async () => {
    bridge.mockCommand('speech_status', () => status)
    render(<I18nProvider lang="es"><DictationSettings /></I18nProvider>)
    const toggle = await screen.findByRole('switch', { name: 'Enviar al terminar de dictar' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    await userEvent.click(toggle)
    expect(useDictationPrefs.getState().sendOnFinish).toBe(true)
    expect(JSON.parse(window.localStorage.getItem('rinari.dictation.v1') ?? '{}')).toEqual({ sendOnFinish: true })
  })
})

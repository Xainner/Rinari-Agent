// @vitest-environment jsdom
// El reproductor de audio propio (ronda 1434, F): sin los controles de
// Chromium, con ▶/pausa, la onda como deslizador, tiempo, silencio y velocidad.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { AudioPlayer } from './AudioPlayer'
import { resetAudioPeaksForTests } from './audioPeaks'

afterEach(() => {
  cleanup()
  resetAudioPeaksForTests()
  vi.unstubAllGlobals()
})

const media = { path: 'out/voz.mp3', name: 'voz.mp3', size: 1200, kind: 'audio' as const, mime: 'audio/mpeg', url: 'app://rinari/__media/test-voz' }

it('pinta su propio reproductor: el audio sin controles nativos, la onda decorativa mientras no hay real', () => {
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
  vi.stubGlobal('OfflineAudioContext', class {})
  render(<I18nProvider lang="es"><AudioPlayer media={media} /></I18nProvider>)
  const audio = screen.getByLabelText('voz.mp3') as HTMLAudioElement
  expect(audio.tagName).toBe('AUDIO')
  expect(audio.controls).toBe(false)
  expect(document.querySelector('.audio-player')?.getAttribute('data-wave')).toBe('decorative')
  expect(screen.getByRole('slider', { name: 'Posición del audio' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Reproducir' })).toBeTruthy()
})

it('reproduce y pausa, salta con el teclado sobre la onda, silencia y cambia la velocidad', () => {
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
  const onPlay = vi.fn()
  render(<I18nProvider lang="es"><AudioPlayer media={media} onPlay={onPlay} /></I18nProvider>)
  const audio = screen.getByLabelText('voz.mp3') as HTMLAudioElement
  const play = vi.spyOn(audio, 'play').mockImplementation(async () => { fireEvent.play(audio) })
  Object.defineProperty(audio, 'duration', { configurable: true, value: 60 })
  fireEvent.loadedMetadata(audio)
  fireEvent.click(screen.getByRole('button', { name: 'Reproducir' }))
  expect(play).toHaveBeenCalled()
  expect(onPlay).toHaveBeenCalledWith(audio)
  expect(screen.getByRole('button', { name: 'Pausar' })).toBeTruthy()
  const slider = screen.getByRole('slider', { name: 'Posición del audio' })
  fireEvent.keyDown(slider, { key: 'ArrowRight' })
  expect(audio.currentTime).toBe(5)
  expect(slider.getAttribute('aria-valuetext')).toBe('0:05 de 1:00')
  fireEvent.keyDown(slider, { key: 'End' })
  expect(audio.currentTime).toBe(60)
  fireEvent.click(screen.getByRole('button', { name: 'Silenciar' }))
  expect(audio.muted).toBe(true)
  fireEvent.volumeChange(audio)
  expect(screen.getByRole('button', { name: 'Activar el sonido' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Velocidad 1×' }))
  expect(audio.playbackRate).toBe(1.5)
  fireEvent.rateChange(audio)
  expect(screen.getByRole('button', { name: 'Velocidad 1.5×' })).toBeTruthy()
})

// @vitest-environment jsdom
// La onda real del reproductor de audio (ronda 1434, F): picos por tramo,
// normalizados, una vez por archivo y nunca para un archivo enorme.
import { afterEach, expect, it, vi } from 'vitest'
import { MAX_PEAK_BYTES, cachedPeaks, decorativePeaks, loadPeaks, reducePeaks, resamplePeaks, resetAudioPeaksForTests } from './audioPeaks'

afterEach(() => {
  resetAudioPeaksForTests()
  vi.unstubAllGlobals()
})

function buffer(samples: number[]) {
  const data = Float32Array.from(samples)
  return { length: data.length, numberOfChannels: 1, getChannelData: () => data }
}

it('reduce los picos por tramo y los normaliza, con un mínimo para el silencio', async () => {
  const peaks = await reducePeaks(buffer([0, 0.1, -0.5, 0.25, 0, 0, 1, -0.2]), 4)
  expect(Array.from(peaks).map((value) => Math.round(value * 100) / 100)).toEqual([0.1, 0.5, 0.06, 1])
})

it('remuestrea a las barras que caben y las decorativas son estables por archivo', () => {
  expect(resamplePeaks(Float32Array.from([0.1, 0.9, 0.3, 0.4]), 2)).toEqual([Math.fround(0.9), Math.fround(0.4)])
  expect(decorativePeaks('a.mp3:10', 12)).toEqual(decorativePeaks('a.mp3:10', 12))
  expect(decorativePeaks('a.mp3:10', 12)).not.toEqual(decorativePeaks('b.mp3:10', 12))
})

it('decodifica una sola vez por archivo y guarda el resultado; un archivo enorme no se descarga', async () => {
  const fetchMock = vi.fn(async () => new Response(new Uint8Array(16), { headers: { 'content-length': '16' } }))
  const decode = vi.fn(async () => buffer([0.5, -1, 0.25, 0]))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('OfflineAudioContext', class { decodeAudioData = decode })
  const [first, second] = await Promise.all([loadPeaks('app://rinari/__media/a', 'voz.mp3:16', 16), loadPeaks('app://rinari/__media/b', 'voz.mp3:16', 16)])
  expect(first).toBe(second)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(cachedPeaks('voz.mp3:16')).toBe(first)
  expect(await loadPeaks('app://rinari/__media/big', 'big.wav', MAX_PEAK_BYTES + 1)).toBeNull()
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('si no se puede decodificar no hay onda, sin error', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(8))))
  vi.stubGlobal('OfflineAudioContext', class { decodeAudioData = async () => { throw new Error('codec') } })
  expect(await loadPeaks('app://rinari/__media/x', 'x.ogg:8', 8)).toBeNull()
  expect(cachedPeaks('x.ogg:8')).toBeNull()
})

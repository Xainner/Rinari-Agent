// @vitest-environment jsdom
// Plan 0.4.0 #35 y la tabla del 35b: cada entrega se ve por lo que es y se
// abre donde corresponde; el audio suena en la tarjeta.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const readFile = vi.fn()
vi.mock('../../services/desktop', () => ({
  desktopApi: {
    readFile: (...args: unknown[]) => readFile(...args),
    watchFile: vi.fn().mockResolvedValue({ watch_id: 'w', preview: { path: '', name: '', language: 'txt', content: '', size: 0 } }),
    unwatchFile: vi.fn().mockResolvedValue({}),
  },
}))

import { I18nProvider } from '../../i18n'
import { setPlatformForTests } from '../../platform'
import { createTestBridge, type TestBridge } from '../../platform/testBridge'
import { resetSessionDockForTests, useSessionDockStore } from '../../stores/sessionDock'
import { FileWorkspaceProvider } from '../files/FileWorkspace'
import { PresentedFiles } from './PresentedFiles'
import { parseDelimited, resetPresentedPreviewsForTests } from './presentedPreview'
import type { PresentTimelineItem } from './types'

let bridge: TestBridge
let restore: () => void
beforeEach(() => {
  bridge = createTestBridge()
  restore = setPlatformForTests(bridge)
  resetSessionDockForTests()
  resetPresentedPreviewsForTests()
  readFile.mockImplementation(async (_session: string, path: string) => ({
    path, name: path, language: 'txt', size: 10,
    content: path.endsWith('.csv') ? 'mes,total\nenero,"1,200"\n' : '# Notas\n- una\n',
  }))
})
afterEach(() => { cleanup(); restore(); vi.clearAllMocks() })

const item = (files: PresentTimelineItem['files']): PresentTimelineItem => ({ id: 'p1', type: 'present', activitySeq: 1, occurredAt: 0, files } as PresentTimelineItem)

function mount(files: PresentTimelineItem['files']) {
  return render(
    <I18nProvider lang="es">
      <FileWorkspaceProvider sessionId="ses_a"><PresentedFiles item={item(files)} /></FileWorkspaceProvider>
    </I18nProvider>,
  )
}

it('lee CSV y TSV con comillas y saltos de línea de Windows', () => {
  expect(parseDelimited('a,b\r\n1,"2,5"\r\n"di ""hola""",x\n', ',')).toEqual([['a', 'b'], ['1', '2,5'], ['di "hola"', 'x']])
  expect(parseDelimited('a\tb\n1\t2', '\t')).toEqual([['a', 'b'], ['1', '2']])
  expect(parseDelimited('1\n2\n3\n4\n5\n6\n7', ',', 3)).toHaveLength(3)
})

it('cada entrega por lo que es: miniatura, filas, líneas, carpeta y página', async () => {
  bridge.mediaKinds['C:/p/portada.png'] = 'image'
  mount([
    { kind: 'image', name: 'portada.png', path: 'C:/p/portada.png', size_bytes: 2048 },
    { kind: 'sheet', name: 'ventas.csv', path: 'C:/p/ventas.csv' },
    { kind: 'markdown', name: 'notas.md', path: 'C:/p/notas.md' },
    { kind: 'folder', name: 'sitio', path: 'C:/p/sitio', entry_count: 9, entries: ['assets/', 'index.html'] },
    { kind: 'web', name: 'example.com', url: 'https://example.com/docs' },
  ])
  const card = screen.getByTestId('presented-files')
  expect(within(card).getByText('5 entregas')).toBeTruthy()
  await waitFor(() => expect(card.querySelector('[data-thumb="image"] img')?.getAttribute('src')).toBe('app://rinari/__media/test-portada.png'))
  await waitFor(() => expect([...card.querySelectorAll('.present-sheet td')].map((cell) => cell.textContent)).toEqual(['enero', '1,200']))
  await waitFor(() => expect(card.querySelector('.present-text')?.textContent).toBe('# Notas\n- una\n'))
  expect(card.querySelector('[data-present-kind="folder"]')?.textContent).toContain('+7 más')
  expect(within(card).getByText('2 KB')).toBeTruthy()
  // La página se abre en el navegador del panel.
  await userEvent.click(within(card).getByRole('button', { name: 'Abrir en el navegador del panel' }))
  expect(useSessionDockStore.getState().layoutFor('ses_a').views).toContain('browser')
  await waitFor(() => expect(bridge.browserCalls).toContainEqual(expect.objectContaining({ kind: 'navigate', url: 'https://example.com/docs' })))
})

it('una imagen que no se puede servir queda con su icono', async () => {
  mount([{ kind: 'image', name: 'rota.png', path: 'C:/p/rota.png' }])
  await waitFor(() => expect(screen.getByTestId('presented-files').querySelector('[data-thumb="icon"]')).toBeTruthy())
})

it('el audio cerca de la vista pide su reproductor (solo metadatos: la duración desde el principio) y no descarga la onda hasta sonar', async () => {
  bridge.mediaKinds['C:/p/tono.mp3'] = 'audio'
  const media = vi.spyOn(bridge.files, 'media')
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
  mount([{ kind: 'audio', name: 'tono.mp3', path: 'C:/p/tono.mp3', caption: 'Voz de prueba · 3:11' }])
  await waitFor(() => expect(screen.getByTestId('presented-files').querySelector('audio')).toBeTruthy())
  expect(media).toHaveBeenCalledTimes(1)
  const audio = screen.getByTestId('presented-files').querySelector('audio')!
  expect(audio.getAttribute('preload')).toBe('metadata')
  expect(audio.autoplay).toBe(false)
  // Mientras llegan los metadatos, la duración de la descripción; y sin onda real todavía.
  expect(screen.getByTestId('presented-files').querySelector('.audio-time')?.textContent).toContain('3:11')
  expect(screen.getByTestId('presented-files').querySelector('.audio-player')?.getAttribute('data-wave')).toBe('decorative')
  expect(fetchSpy).not.toHaveBeenCalled()
  fetchSpy.mockRestore()
})

it('pulsar una imagen entregada abre el visor grande, no Archivos', async () => {
  bridge.mediaKinds['C:/p/portada.png'] = 'image'
  mount([{ kind: 'image', name: 'portada.png', path: 'C:/p/portada.png' }])
  const thumb = await screen.findByRole('button', { name: 'Ampliar imagen: portada.png' })
  await waitFor(() => expect(thumb.querySelector('img')?.getAttribute('src')).toBe('app://rinari/__media/test-portada.png'))
  await userEvent.click(thumb)
  const viewer = await screen.findByRole('dialog')
  expect(viewer.getAttribute('aria-label')).toBe('Vista previa de portada.png')
  expect(bridge.openedFiles).toEqual([])
  // Archivos sigue a un clic, desde el visor.
  expect(within(viewer).getByRole('button', { name: 'Abrir en Archivos' })).toBeTruthy()
})

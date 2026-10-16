// @vitest-environment jsdom
// Plan 0.4.0 #77: un solo visor grande. «2 de 4» y ← → entre las imágenes,
// zoom con Ajustar / 100 %, la pestaña del texto reconocido, abrir en
// Archivos y Esc para cerrar.
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import ImageViewer, { type ViewerImage } from './ImageViewer'

const host = vi.hoisted(() => ({ copy: vi.fn(async () => {}), save: vi.fn(async () => ({ saved: true })) }))
vi.mock('../../platform', () => ({ platform: () => ({ images: host }) }))
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: toasts }))

afterEach(() => { cleanup(); vi.clearAllMocks() })

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/0d6NQAAAABJRU5ErkJggg=='

function Harness({ images, start = 0, onClose = () => {} }: { images: ViewerImage[]; start?: number; onClose?: () => void }) {
  const [index, setIndex] = useState(start)
  const [open, setOpen] = useState(true)
  return <I18nProvider lang="es"><ImageViewer open={open} images={images} index={index} onIndexChange={setIndex} onClose={() => { setOpen(false); onClose() }} /></I18nProvider>
}

const images = (n: number, extra: Partial<ViewerImage> = {}): ViewerImage[] =>
  Array.from({ length: n }, (_, i) => ({ key: `k${i}`, name: `foto-${i + 1}.png`, src: PIXEL, detail: '900 × 500', ...extra }))

/** jsdom no carga imágenes: se le da su tamaño natural a mano. */
function loaded(width = 900, height = 500) {
  const img = screen.getByRole('img') as HTMLImageElement
  Object.defineProperty(img, 'naturalWidth', { value: width, configurable: true })
  Object.defineProperty(img, 'naturalHeight', { value: height, configurable: true })
  fireEvent.load(img)
  return img
}

it('dice cuál es de cuántas y pasa con ← → y con los botones', async () => {
  render(<Harness images={images(4)} start={1} />)
  const dialog = screen.getByRole('dialog')
  // La etiqueta que usan las pruebas nativas: «Vista previa de …».
  expect(dialog.getAttribute('aria-label')).toBe('Vista previa de foto-2.png')
  expect(dialog.textContent).toContain('2 de 4')
  fireEvent.keyDown(dialog, { key: 'ArrowRight' })
  expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Vista previa de foto-3.png')
  await userEvent.click(screen.getByRole('button', { name: 'Imagen anterior' }))
  await userEvent.click(screen.getByRole('button', { name: 'Imagen anterior' }))
  expect(screen.getByRole('dialog').textContent).toContain('1 de 4')
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' })
  expect(screen.getByRole('dialog').textContent).toContain('4 de 4')
})

it('una sola imagen no ofrece moverse entre imágenes', () => {
  render(<Harness images={images(1)} />)
  expect(screen.queryByRole('button', { name: 'Imagen anterior' })).toBeNull()
  expect(screen.getByRole('dialog').textContent).not.toContain('de 1')
})

it('100 % y Ajustar cambian el zoom, y Esc cierra', async () => {
  const onClose = vi.fn()
  render(<Harness images={images(1)} onClose={onClose} />)
  loaded(4000, 3000)
  const percent = () => document.querySelector('.image-viewer-percent')?.textContent
  await userEvent.click(screen.getByRole('button', { name: '100 %' }))
  expect(percent()).toBe('100 %')
  expect(screen.getByRole('button', { name: '100 %' }).getAttribute('aria-pressed')).toBe('true')
  await userEvent.click(screen.getByRole('button', { name: 'Acercar' }))
  expect(percent()).toBe('125 %')
  expect(screen.getByRole('button', { name: /Ajustar/ }).getAttribute('aria-pressed')).toBe('false')
  await userEvent.click(screen.getByRole('button', { name: /Ajustar/ }))
  expect(screen.getByRole('button', { name: /Ajustar/ }).getAttribute('aria-pressed')).toBe('true')
  await userEvent.keyboard('{Escape}')
  await waitFor(() => expect(onClose).toHaveBeenCalled())
})

it('carga la imagen grande cuando no viene lista y, con OCR, enseña el texto en su pestaña', async () => {
  const load = vi.fn(async () => PIXEL)
  render(<Harness images={[{ key: 'a', name: 'captura.png', load, recognized: <p>Error 404</p> }]} />)
  await waitFor(() => expect(screen.getByRole('img').getAttribute('src')).toBe(PIXEL))
  expect(load).toHaveBeenCalledTimes(1)
  await userEvent.click(screen.getByRole('tab', { name: 'Texto reconocido' }))
  expect(screen.getByText('Error 404')).toBeTruthy()
})

it('«Abrir en Archivos» abre y cierra el visor', async () => {
  const openInFiles = vi.fn()
  const onClose = vi.fn()
  render(<Harness images={images(1, { onOpenInFiles: openInFiles })} onClose={onClose} />)
  await userEvent.click(screen.getByRole('button', { name: 'Abrir en Archivos' }))
  expect(openInFiles).toHaveBeenCalled()
  expect(onClose).toHaveBeenCalled()
})

it('«Copiar» y «Descargar» piden la imagen entera al host por su archivo', async () => {
  const file = { session_id: 's1', path: 'artifact://s1/media/captura.png' }
  render(<Harness images={images(1, { file })} />)
  await userEvent.click(screen.getByRole('button', { name: 'Copiar imagen' }))
  expect(host.copy).toHaveBeenCalledWith(file)
  // El propio botón confirma, sin aviso.
  expect(await screen.findByRole('button', { name: 'Imagen copiada' })).toBeTruthy()
  expect(toasts.success).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Descargar' }))
  expect(host.save).toHaveBeenCalledWith(file)
  await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Guardada: foto-1.png'))
})

it('un formato que no se puede copiar lo dice y sugiere descargar', async () => {
  host.copy.mockRejectedValueOnce(Object.assign(new Error('unsupported'), { code: 'UNSUPPORTED_IMAGE' }))
  render(<Harness images={images(1, { file: { session_id: 's1', path: 'artifact://s1/media/x.avif' } })} />)
  await userEvent.click(screen.getByRole('button', { name: 'Copiar imagen' }))
  await waitFor(() => expect(toasts.error).toHaveBeenCalledWith('Este formato no se puede copiar; usa «Descargar»'))
})

it('sin archivo no ofrece copiar ni descargar', () => {
  render(<Harness images={images(1)} />)
  expect(screen.queryByRole('button', { name: 'Copiar imagen' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Descargar' })).toBeNull()
})

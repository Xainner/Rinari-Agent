// «Copiar» y «Descargar» del visor: main solo toca lo que el Engine resolvió.
import { describe, expect, it, vi } from 'vitest'

import { createImages, type ImagesIo } from './images'

interface FakeImage { isEmpty(): boolean; toPNG(): Uint8Array }

const request = { session_id: 's1', path: 'artifact://s1/media/captura.png' }

function fakeIo(overrides: Partial<ImagesIo<FakeImage>> = {}) {
  const written: string[] = []
  const io: ImagesIo<FakeImage> = {
    resolve: vi.fn(async () => ({ path: '/store/ab/cd.bin', name: 'captura.png', kind: 'image', mime: 'image/png' })),
    imageFromPath: vi.fn((path: string) => ({ isEmpty: () => false, toPNG: () => new TextEncoder().encode(`png:${path}`) })),
    writePng: vi.fn(async (png: Uint8Array) => { written.push(new TextDecoder().decode(png)) }),
    showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: '/home/me/Downloads/captura.png' })),
    copyFile: vi.fn(async () => {}),
    downloadsDir: () => '/home/me/Downloads',
    saveTitle: () => 'Guardar imagen',
    join: (...parts: string[]) => parts.join('/'),
    ...overrides,
  }
  return { io, written }
}

describe('copy', () => {
  it('copies the resolved file, not anything the renderer names', async () => {
    const { io, written } = fakeIo()
    await createImages(io).copy(request)
    expect(io.resolve).toHaveBeenCalledWith(request)
    expect(written).toEqual(['png:/store/ab/cd.bin'])
  })

  it('refuses something that is not an image', async () => {
    const { io } = fakeIo({ resolve: vi.fn(async () => ({ path: '/store/x', name: 'notas.txt', kind: 'text', mime: 'text/plain' })) })
    await expect(createImages(io).copy(request)).rejects.toMatchObject({ code: 'NOT_AN_IMAGE' })
    expect(io.writePng).not.toHaveBeenCalled()
  })

  it('says so when the system cannot decode the format', async () => {
    const { io } = fakeIo({ imageFromPath: vi.fn(() => ({ isEmpty: () => true, toPNG: () => new Uint8Array() })) })
    await expect(createImages(io).copy(request)).rejects.toMatchObject({ code: 'UNSUPPORTED_IMAGE' })
    expect(io.writePng).not.toHaveBeenCalled()
  })
})

describe('save', () => {
  it('offers Downloads with the image name and copies the file where the person chose', async () => {
    const { io } = fakeIo()
    await expect(createImages(io).save(request)).resolves.toEqual({ saved: true })
    expect(io.showSaveDialog).toHaveBeenCalledWith({
      title: 'Guardar imagen',
      defaultPath: '/home/me/Downloads/captura.png',
      filters: [{ name: 'PNG', extensions: ['png'] }],
    })
    expect(io.copyFile).toHaveBeenCalledWith('/store/ab/cd.bin', '/home/me/Downloads/captura.png')
  })

  it('cancelling writes nothing', async () => {
    const { io } = fakeIo({ showSaveDialog: vi.fn(async () => ({ canceled: true })) })
    await expect(createImages(io).save(request)).resolves.toEqual({ saved: false })
    expect(io.copyFile).not.toHaveBeenCalled()
  })
})

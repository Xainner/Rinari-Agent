// Guardar y abrir un .json con el diálogo nativo: qué acepta main del
// renderer y qué hace con la ruta que elige la persona.
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/home/me/Documents' }, dialog: {} }))

const { assertOpenJson, assertSaveJson, createJsonFiles } = await import('./jsonFiles')
const { JSON_FILE_MAX_BYTES } = await import('../../shared/contracts')

function fakeIo(overrides: Partial<Parameters<typeof createJsonFiles>[1]> = {}) {
  const written: Array<[string, string]> = []
  const io = {
    showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: '/backup/memoria.json' })),
    showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: ['/backup/memoria.json'] })),
    documentsDir: () => '/home/me/Documents',
    size: vi.fn(async () => 20),
    read: vi.fn(async () => '\uFEFF{"bundle":{},"digest":"x"}'),
    write: vi.fn(async (path: string, contents: string) => { written.push([path, contents]) }),
    ...overrides,
  }
  return { io, written }
}

describe('validation', () => {
  it('accepts a file name and JSON text, nothing else', () => {
    const ok = { suggestedName: 'rinari-memory-2026-10-09.json', contents: '{"a":1}', title: 'Exportar' }
    expect(assertSaveJson(ok)).toEqual(ok)
    for (const bad of [
      null,
      [],
      { ...ok, suggestedName: '..\\..\\evil.json' },
      { ...ok, suggestedName: 'C:/Users/me/x.json' },
      { ...ok, suggestedName: 'memoria.exe' },
      { ...ok, suggestedName: '.json' },
      { ...ok, contents: 42 },
      { ...ok, title: 'x'.repeat(201) },
    ]) {
      expect(() => assertSaveJson(bad)).toThrow()
    }
    expect(() => assertSaveJson({ ...ok, contents: 'not json' })).toThrow(expect.objectContaining({ code: 'INVALID_FILE' }))
    expect(() => assertSaveJson({ ...ok, contents: `"${'x'.repeat(JSON_FILE_MAX_BYTES)}"` })).toThrow(
      expect.objectContaining({ code: 'FILE_TOO_LARGE' }),
    )
    expect(assertOpenJson(undefined)).toEqual({})
    expect(() => assertOpenJson({ title: 3 })).toThrow()
  })
})

describe('save', () => {
  it('writes only to the path chosen in the dialog, always as .json', async () => {
    const { io, written } = fakeIo({
      showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: '/backup/memoria' })),
    })
    const files = createJsonFiles(() => null, io)
    const result = await files.save({ suggestedName: 'rinari-memory.json', contents: '{}', title: 'Exportar' })
    expect(result).toEqual({ saved: true, name: 'memoria.json' })
    expect(written).toEqual([['/backup/memoria.json', '{}']])
    const [, options] = io.showSaveDialog.mock.calls[0] as unknown as [unknown, { defaultPath: string; filters: unknown }]
    expect(options.defaultPath).toMatch(/Documents[\\/]rinari-memory\.json$/)
    expect(options.filters).toEqual([{ name: 'JSON', extensions: ['json'] }])
  })

  it('cancelling writes nothing', async () => {
    const { io, written } = fakeIo({ showSaveDialog: vi.fn(async () => ({ canceled: true })) })
    expect(await createJsonFiles(() => null, io).save({ suggestedName: 'a.json', contents: '{}' })).toEqual({ saved: false })
    expect(written).toEqual([])
  })
})

describe('open', () => {
  it('returns the name and text of the chosen .json, without its folder or BOM', async () => {
    const { io } = fakeIo()
    expect(await createJsonFiles(() => null, io).open({})).toEqual({
      name: 'memoria.json',
      contents: '{"bundle":{},"digest":"x"}',
    })
  })

  it('refuses another extension, a large file before reading it, and text that is not JSON', async () => {
    const other = fakeIo({ showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: ['/x/memoria.txt'] })) })
    await expect(createJsonFiles(() => null, other.io).open({})).rejects.toMatchObject({ code: 'INVALID_FILE' })

    const large = fakeIo({ size: vi.fn(async () => JSON_FILE_MAX_BYTES + 1) })
    await expect(createJsonFiles(() => null, large.io).open({})).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' })
    expect(large.io.read).not.toHaveBeenCalled()

    const broken = fakeIo({ read: vi.fn(async () => '{not json') })
    await expect(createJsonFiles(() => null, broken.io).open({})).rejects.toMatchObject({ code: 'INVALID_FILE' })
  })

  it('cancelling returns null', async () => {
    const { io } = fakeIo({ showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })) })
    expect(await createJsonFiles(() => null, io).open({})).toBeNull()
  })
})

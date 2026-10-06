import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { createMediaRegistry, mediaToken, parseRange, serveMedia } from './mediaFiles'

const dir = mkdtempSync(join(tmpdir(), 'rinari-media-'))
const file = join(dir, 'promo.mp4')
writeFileSync(file, Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256)))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('media registry', () => {
  it('hands out unguessable app URLs that expire', () => {
    let now = 0
    let n = 0
    const registry = createMediaRegistry({ origin: 'app://rinari', ttlMs: 100, now: () => now, token: () => `${'a'.repeat(16)}${n++}` })
    const url = registry.grant({ path: file, mime: 'video/mp4' })
    expect(url).toBe('app://rinari/__media/aaaaaaaaaaaaaaaa0')
    expect(registry.lookup(mediaToken(url)!)).toEqual({ path: file, mime: 'video/mp4' })
    now = 100
    expect(registry.lookup(mediaToken(url)!)).toBeNull()
  })

  it('keeps at most `max` grants, dropping the oldest', () => {
    let n = 0
    const registry = createMediaRegistry({ origin: 'app://rinari', max: 2, token: () => `${'b'.repeat(16)}${n++}` })
    const first = registry.grant({ path: 'a', mime: 'image/png' })
    registry.grant({ path: 'b', mime: 'image/png' })
    registry.grant({ path: 'c', mime: 'image/png' })
    registry.grant({ path: 'd', mime: 'image/png' })
    expect(registry.lookup(mediaToken(first)!)).toBeNull()
  })

  it('only treats /__media/<hex> as a media request', () => {
    expect(mediaToken('app://rinari/__media/0123456789abcdef')).toBe('0123456789abcdef')
    expect(mediaToken('app://rinari/index.html')).toBeNull()
    expect(mediaToken('app://rinari/__media/../index.html')).toBeNull()
    expect(mediaToken('app://rinari/__media/short')).toBeNull()
  })
})

describe('ranges', () => {
  it('parses the forms a media element sends', () => {
    expect(parseRange(null, 1000)).toBeNull()
    expect(parseRange('bytes=0-', 1000)).toEqual({ start: 0, end: 999 })
    expect(parseRange('bytes=100-199', 1000)).toEqual({ start: 100, end: 199 })
    expect(parseRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseRange('bytes=1000-', 1000)).toBe('invalid')
    expect(parseRange('bytes=5-2', 1000)).toBe('invalid')
    expect(parseRange('items=0-1', 1000)).toBe('invalid')
  })

  it('serves the whole file or just the requested range', async () => {
    const whole = await serveMedia(new Request('app://rinari/__media/x'), { path: file, mime: 'video/mp4' })
    expect(whole.status).toBe(200)
    expect(whole.headers.get('accept-ranges')).toBe('bytes')
    expect((await whole.arrayBuffer()).byteLength).toBe(1000)

    const part = await serveMedia(new Request('app://rinari/__media/x', { headers: { Range: 'bytes=10-19' } }), { path: file, mime: 'video/mp4' })
    expect(part.status).toBe(206)
    expect(part.headers.get('content-range')).toBe('bytes 10-19/1000')
    expect(part.headers.get('content-type')).toBe('video/mp4')
    expect([...new Uint8Array(await part.arrayBuffer())]).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])

    const outside = await serveMedia(new Request('app://rinari/__media/x', { headers: { Range: 'bytes=2000-' } }), { path: file, mime: 'video/mp4' })
    expect(outside.status).toBe(416)
    const gone = await serveMedia(new Request('app://rinari/__media/x'), { path: join(dir, 'gone.mp4'), mime: 'video/mp4' })
    expect(gone.status).toBe(404)
  })
})

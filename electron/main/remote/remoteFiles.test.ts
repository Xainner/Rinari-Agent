import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createRemoteFiles, dispositionName, kindOf, uploadLocalPaths } from './remoteFiles'

const remote = { id: 'srv', server: 'https://rinari.example.com', token: 'tok' }

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rinari-remote-files-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('dispositionName', () => {
  it('prefers the UTF-8 name and falls back to the plain one', () => {
    expect(dispositionName(`attachment; filename="informe.pdf"; filename*=UTF-8''informe%20a%C3%B1o.pdf`)).toBe('informe año.pdf')
    expect(dispositionName('inline; filename="foto.png"')).toBe('foto.png')
    expect(dispositionName('inline; filename=foto.png')).toBe('foto.png')
    expect(dispositionName(null)).toBeNull()
    expect(dispositionName('inline')).toBeNull()
  })
})

describe('kindOf', () => {
  it('maps the type the server sends', () => {
    expect(kindOf('image/png', 'a.png')).toBe('image')
    expect(kindOf('video/mp4', 'a.mp4')).toBe('video')
    expect(kindOf('audio/mpeg', 'a.mp3')).toBe('audio')
    expect(kindOf('application/pdf', 'a')).toBe('pdf')
    expect(kindOf('application/octet-stream', 'a.PDF')).toBe('pdf')
    expect(kindOf('text/plain; charset=utf-8', 'a.txt')).toBe('text')
    expect(kindOf('application/zip', 'a.zip')).toBe('binary')
  })
})

describe('createRemoteFiles', () => {
  it('downloads an artifact into the cache with the server name', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('hola', {
        headers: { 'content-type': 'text/plain; charset=utf-8', 'content-disposition': `inline; filename*=UTF-8''nota%C3%B1.txt` },
      }),
    )
    const files = createRemoteFiles({ cacheDir: dir, fetch: fetchImpl as unknown as typeof fetch })
    const file = await files.download(remote, { session_id: 's1', path: 'artifact://abc/nota.txt' })

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.pathname).toBe('/remote/v1/files/artifact')
    expect(url.searchParams.get('uri')).toBe('artifact://abc/nota.txt')
    expect(init.headers).toEqual({ authorization: 'Bearer tok' })
    expect(file).toMatchObject({ name: 'notañ.txt', size: 4, kind: 'text', mime: 'text/plain' })
    expect(readFileSync(file.path, 'utf8')).toBe('hola')
    expect(file.path.startsWith(dir)).toBe(true)
  })

  it('asks for workspace files by session and path, and never escapes the cache', async () => {
    const fetchImpl = vi.fn(async () => new Response('x', { headers: { 'content-disposition': 'attachment; filename="../../evil.sh"' } }))
    const files = createRemoteFiles({ cacheDir: dir, fetch: fetchImpl as unknown as typeof fetch })
    const file = await files.download(remote, { session_id: 's1', path: 'src/app.py', turn_id: 't9' })
    const [url] = fetchImpl.mock.calls[0] as unknown as [URL]
    expect(url.pathname).toBe('/remote/v1/files/workspace')
    expect(Object.fromEntries(url.searchParams)).toEqual({ session_id: 's1', path: 'src/app.py', turn_id: 't9' })
    expect(file.name).toBe('evil.sh')
    expect(file.path.startsWith(dir)).toBe(true)
  })

  it('passes the server error code through', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'REMOTE_FORBIDDEN', message: 'no' } }), { status: 403 }))
    const files = createRemoteFiles({ cacheDir: dir, fetch: fetchImpl as unknown as typeof fetch })
    await expect(files.download(remote, { session_id: 's1', path: '/etc/passwd' })).rejects.toMatchObject({ code: 'REMOTE_FORBIDDEN' })
    expect(readdirSync(dir)).toEqual([])
  })

  it('uploads a local file once and returns its server path', async () => {
    const local = join(dir, 'foto.png')
    writeFileSync(local, 'png-bytes')
    const fetchImpl = vi.fn(async (_url: URL, init: RequestInit) => {
      expect(await new Response(init.body as ConstructorParameters<typeof Response>[0]).text()).toBe('png-bytes')
      return new Response(JSON.stringify({ path: '/srv/state/uploads/dev/foto.png' }))
    })
    const files = createRemoteFiles({ cacheDir: dir, fetch: fetchImpl as unknown as typeof fetch })
    expect(await files.upload(remote, local)).toBe('/srv/state/uploads/dev/foto.png')
    expect(await files.upload(remote, local)).toBe('/srv/state/uploads/dev/foto.png')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url.pathname).toBe('/remote/v1/uploads')
    expect(url.searchParams.get('name')).toBe('foto.png')
    expect(init.method).toBe('POST')
  })

  it('refuses to upload a folder of this computer', async () => {
    const files = createRemoteFiles({ cacheDir: dir, fetch: vi.fn() as unknown as typeof fetch })
    await expect(files.upload(remote, dir)).rejects.toMatchObject({ code: 'REMOTE_LOCAL_FOLDER' })
  })
})

describe('uploadLocalPaths', () => {
  it('uploads only absolute paths that exist here', async () => {
    const local = join(dir, 'doc.pdf')
    writeFileSync(local, 'pdf')
    const upload = vi.fn(async (path: string) => `/srv/${path.length}`)
    const params = {
      session_id: 's1',
      attachments: [{ path: local, name: 'doc.pdf' }, { path: 'relative/in/server.txt' }, { path: '/srv/already/there.txt' }, null],
    }
    const out = await uploadLocalPaths('turn.start', params, upload)
    expect(out.attachments).toEqual([
      { path: `/srv/${local.length}`, name: 'doc.pdf' },
      { path: 'relative/in/server.txt' },
      { path: '/srv/already/there.txt' },
      null,
    ])
    expect(upload).toHaveBeenCalledTimes(1)
    expect(params.attachments[0]).toEqual({ path: local, name: 'doc.pdf' }) // sin mutar
  })

  it('handles soul imports and skill sources, and leaves other methods alone', async () => {
    const soulFolder = join(dir, 'alma')
    mkdirSync(soulFolder)
    const skill = join(dir, 'skill.zip')
    writeFileSync(skill, 'zip')
    const upload = vi.fn(async () => '/srv/up')
    expect((await uploadLocalPaths('soul.import', { paths: [soulFolder, '/srv/x'] }, upload)).paths).toEqual(['/srv/up', '/srv/x'])
    expect((await uploadLocalPaths('skill.job.start', { source: skill }, upload)).source).toBe('/srv/up')
    expect((await uploadLocalPaths('project.create', { paths: [skill], source: skill }, upload))).toEqual({ paths: [skill], source: skill })
  })
})

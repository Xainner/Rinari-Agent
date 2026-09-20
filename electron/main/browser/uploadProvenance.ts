import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

export interface UploadProvenance {
  path: string
  bytes: number
  sha256: string
}

export type UploadVerification =
  | { ok: true; path: string }
  | { ok: false; reason: string }

const comparablePath = (path: string) => {
  const absolute = resolve(path)
  return process.platform === 'win32' ? absolute.toLocaleLowerCase('en-US') : absolute
}

const digestFile = (path: string) =>
  new Promise<string>((resolveDigest, reject) => {
    const digest = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('data', (chunk) => digest.update(chunk))
    stream.once('error', reject)
    stream.once('end', () => resolveDigest(digest.digest('hex')))
  })

function expectedOf(value: unknown): UploadProvenance | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  return typeof raw.path === 'string' &&
    Number.isSafeInteger(raw.bytes) &&
    Number(raw.bytes) >= 0 &&
    typeof raw.sha256 === 'string' &&
    /^[a-f0-9]{64}$/i.test(raw.sha256)
    ? { path: raw.path, bytes: Number(raw.bytes), sha256: raw.sha256.toLowerCase() }
    : null
}

/** Revalida en el host la identidad fijada por el sandbox del Engine (BR-09). */
export async function verifyUploadFile(path: string, rawExpected: unknown): Promise<UploadVerification> {
  const expected = expectedOf(rawExpected)
  if (!expected) return { ok: false, reason: 'the upload has no valid provenance' }
  try {
    const canonical = await realpath(path)
    if (comparablePath(canonical) !== comparablePath(expected.path)) {
      return { ok: false, reason: 'the upload path no longer resolves to the validated file' }
    }
    const before = await stat(canonical)
    if (!before.isFile()) return { ok: false, reason: 'only a regular file can be uploaded' }
    const sha256 = await digestFile(canonical)
    const after = await stat(canonical)
    const stable =
      before.size === after.size &&
      before.mtimeMs === after.mtimeMs &&
      before.dev === after.dev &&
      before.ino === after.ino
    if (!stable || after.size !== expected.bytes || sha256 !== expected.sha256) {
      return { ok: false, reason: 'the upload changed after sandbox validation' }
    }
    return { ok: true, path: canonical }
  } catch {
    return { ok: false, reason: 'the validated upload is no longer available' }
  }
}

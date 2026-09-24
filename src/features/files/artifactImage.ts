import { useEffect, useState } from 'react'
import { engineApi } from '../../services/engine'

/** The formats `attachment.preview` renders; anything else stays a link or text. */
const IMAGE_EXTENSION = /\.(png|jpe?g|webp)$/i
const IMAGE_TYPE = /^image\/(png|jpeg|webp)$/i
/** Previews are at most 512 KiB each; a long chat keeps only the recent ones. */
const CACHE_LIMIT = 32

export function isArtifactImage(uri: string, contentType?: string): boolean {
  if (!uri.startsWith('artifact://')) return false
  return contentType ? IMAGE_TYPE.test(contentType) : IMAGE_EXTENSION.test(uri)
}

const cache = new Map<string, Promise<string>>()

/**
 * A data URL for an image artifact, read from the store it already lives in:
 * the renderer cannot load `artifact://` itself, and no copy is made.
 */
export function artifactImageUrl(uri: string, maxDimension = 2048): Promise<string> {
  const key = `${maxDimension}\0${uri}`
  const cached = cache.get(key)
  if (cached) return cached
  const pending = engineApi.attachmentPreview(uri, 512 * 1024, maxDimension).then((result) => {
    if (typeof result.data_url === 'string') return result.data_url
    if (typeof result.base64 === 'string' && typeof result.mime_type === 'string') {
      return `data:${result.mime_type};base64,${result.base64}`
    }
    throw new Error('The artifact has no image preview.')
  })
  pending.catch(() => cache.delete(key))
  cache.set(key, pending)
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
  return pending
}

export function useArtifactImage(uri: string | null, maxDimension = 2048): { url?: string; failed: boolean } {
  const [state, setState] = useState<{ url?: string; failed: boolean }>({ failed: false })
  useEffect(() => {
    setState({ failed: false })
    if (!uri) return
    let alive = true
    artifactImageUrl(uri, maxDimension)
      .then((url) => { if (alive) setState({ url, failed: false }) })
      .catch(() => { if (alive) setState({ failed: true }) })
    return () => { alive = false }
  }, [uri, maxDimension])
  return state
}

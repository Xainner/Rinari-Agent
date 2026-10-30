/**
 * Qué se puede adjuntar y hasta cuánto (plan 0.4.0 #57 y #18). Es el espejo
 * de lo que acepta el Engine (`artifacts/attachments.py`): el composer avisa
 * antes de enviar en vez de que el adjunto falle después.
 */

export type AttachmentCategory = 'image' | 'audio' | 'video' | 'document' | 'text' | 'archive'

const MIB = 1024 * 1024
/** Lo que el Engine guarda tal cual (audio, video, comprimidos): el tope de las descargas. */
export const MEDIA_MAX_BYTES = 1024 * MIB
export const IMAGE_MAX_BYTES = 10 * MIB
export const DOCUMENT_MAX_BYTES = 25 * MIB
/**
 * Un archivo sin ruta (pegado del portapapeles) viaja dentro del mensaje, en
 * base64 (+33 %), y cada comando entre la ventana y la app admite 8 MiB.
 */
export const INLINE_MAX_BYTES = 6 * MIB

const IMAGE = ['.png', '.jpg', '.jpeg', '.webp']
const AUDIO = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.opus']
const VIDEO = ['.mp4', '.mov', '.mkv', '.webm', '.avi']
const DOCUMENT = ['.pdf', '.docx', '.xlsx', '.pptx']
const TEXT = [
  '.bat', '.c', '.cc', '.cfg', '.cmd', '.conf', '.cpp', '.css', '.csv', '.go', '.h', '.hpp',
  '.htm', '.html', '.ini', '.java', '.js', '.json', '.jsx', '.kt', '.log', '.md', '.ps1', '.py',
  '.rb', '.rs', '.sh', '.sql', '.svelte', '.svg', '.swift', '.toml', '.ts', '.tsx', '.txt',
  '.vue', '.xml', '.yaml', '.yml',
]
const TEXT_NAMES = ['dockerfile', 'makefile', 'license', 'readme']
/** El modelo recibe la lista de lo que hay dentro y lo extrae con artifact.export. */
const ARCHIVE = ['.zip', '.tar', '.tgz', '.tar.gz']

function extension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot).toLowerCase() : ''
}

/** La categoría que el Engine aceptará, o `null` si no lo admite. */
export function attachmentCategory(name: string, mime?: string): AttachmentCategory | null {
  const ext = extension(name)
  if (IMAGE.includes(ext) || ['image/png', 'image/jpeg', 'image/webp'].includes(mime ?? '')) return 'image'
  if (AUDIO.includes(ext) || mime?.startsWith('audio/')) return 'audio'
  if (VIDEO.includes(ext) || mime?.startsWith('video/')) return 'video'
  if (DOCUMENT.includes(ext)) return 'document'
  if (ARCHIVE.some((suffix) => name.toLowerCase().endsWith(suffix))) return 'archive'
  if (TEXT.includes(ext) || TEXT_NAMES.includes(name.toLowerCase())) return 'text'
  return null
}

export function maxBytes(category: AttachmentCategory): number {
  if (category === 'audio' || category === 'video' || category === 'archive') return MEDIA_MAX_BYTES
  if (category === 'image') return IMAGE_MAX_BYTES
  return DOCUMENT_MAX_BYTES
}

/** El `kind` del composer para lo que tiene vista propia (imagen, audio, video). */
export function attachmentKind(category: AttachmentCategory): 'image' | 'audio' | 'video' | undefined {
  return category === 'image' || category === 'audio' || category === 'video' ? category : undefined
}

/**
 * Huella del contenido de un archivo sin ruta (#18): dos capturas pegadas se
 * llaman las dos `image.png`, así que el nombre no sirve para saber si son la
 * misma. FNV-1a sobre el data URL, más su largo.
 */
export function contentKey(dataUrl: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < dataUrl.length; index += 1) {
    hash ^= dataUrl.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${dataUrl.length}:${(hash >>> 0).toString(16)}`
}

export function newAttachmentId(): string {
  return `att_${crypto.randomUUID()}`
}

export function formatMiB(bytes: number): string {
  return bytes >= 1024 * MIB ? `${Math.round(bytes / (1024 * MIB))} GiB` : `${Math.round(bytes / MIB)} MiB`
}

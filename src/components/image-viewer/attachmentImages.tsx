import { useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import type { AttachmentRef } from '../../types'
import { useI18n } from '../../i18n'
import { engineApi } from '../../services/engine'
import type { FileWorkspaceController } from '../../features/files/FileWorkspace'
import type { ViewerImage } from './ImageViewer'

/** La imagen grande de un adjunto, por la vista previa del Engine. */
export async function attachmentImageUrl(uri: string): Promise<string> {
  const result = await engineApi.attachmentPreview(uri, 512 * 1024, 2048)
  if (typeof result.data_url === 'string') return result.data_url
  if (typeof result.base64 === 'string' && typeof result.mime_type === 'string') return `data:${result.mime_type};base64,${result.base64}`
  throw new Error('no preview')
}

/** El texto que se reconoció de una imagen (OCR), para su pestaña en el visor. */
export function RecognizedText({ derivedUri }: { derivedUri: string }) {
  const { t } = useI18n()
  const [text, setText] = useState<string>()
  useEffect(() => {
    let alive = true
    engineApi.attachmentPreview(derivedUri, 512 * 1024)
      .then((result) => { if (alive) setText(typeof result.text === 'string' ? result.text : t('attach.previewUnavailable')) })
      .catch(() => { if (alive) setText(t('attach.previewFailed')) })
    return () => { alive = false }
  }, [derivedUri, t])
  if (text === undefined) return <p role="status" className="flex items-center gap-2 text-sm text-[var(--text-muted)]"><LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> {t('attach.previewLoading')}</p>
  return <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[var(--text-muted)]">{text}</pre>
}

export const isImageAttachment = (attachment: Pick<AttachmentRef, 'kind' | 'previewUrl' | 'uri'>) =>
  attachment.kind === 'image' && Boolean(attachment.previewUrl || attachment.uri)

/** Las imágenes de un mensaje o del composer, como las recorre el visor. */
export function attachmentViewerImages(attachments: AttachmentRef[], files: FileWorkspaceController | null): ViewerImage[] {
  return attachments.filter(isImageAttachment).map((attachment) => {
    const uri = attachment.uri
    return {
      key: attachment.id,
      name: attachment.name,
      // La miniatura sirve mientras llega la grande; con uri se pide la grande.
      src: uri ? undefined : attachment.previewUrl,
      load: uri ? () => attachmentImageUrl(uri) : undefined,
      detail: attachment.mime_type,
      recognized: attachment.ocr && attachment.derivedUri ? <RecognizedText derivedUri={attachment.derivedUri} /> : undefined,
      onOpenInFiles: files && uri ? () => files.open(uri) : undefined,
    }
  })
}

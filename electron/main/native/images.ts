/**
 * «Copiar» y «Descargar» del visor de imágenes (plan 0.4.0 #77).
 *
 * El renderer solo nombra la imagen (un `artifact://` o una ruta del
 * workspace con su sesión y turno); el Engine dice dónde están sus bytes y
 * qué son. main copia ese archivo al portapapeles o a la ruta que la persona
 * elige en el diálogo. Nunca se lee una ruta que mande el renderer.
 */

import { extname } from 'node:path'

import type { OpenExternalFileRequest } from '../../shared/contracts'
import { EngineCommandError } from '../engine/EngineSupervisor'

interface ResolvedImage {
  path: string
  name: string
  kind: string
  mime: string
}

interface ImageLike {
  isEmpty(): boolean
  toPNG(): Uint8Array
}

export interface ImagesIo<Image extends ImageLike = ImageLike> {
  /** Ruta autorizada por el Engine (`artifact.resolve` / `workspace.file.resolve`). */
  resolve(request: OpenExternalFileRequest): Promise<ResolvedImage>
  imageFromPath(path: string): Image
  /** Escribe un PNG en el portapapeles del sistema. */
  writePng(png: Uint8Array): Promise<void>
  showSaveDialog(options: { title: string; defaultPath: string; filters: Array<{ name: string; extensions: string[] }> }): Promise<{ canceled: boolean; filePath?: string }>
  copyFile(from: string, to: string): Promise<void>
  downloadsDir(): string
  saveTitle(): string
  join(...parts: string[]): string
}

async function resolveImage(io: ImagesIo, request: OpenExternalFileRequest): Promise<ResolvedImage> {
  const file = await io.resolve(request)
  if (file.kind !== 'image') throw new EngineCommandError('NOT_AN_IMAGE', 'the file is not an image')
  return file
}

export function createImages<Image extends ImageLike>(io: ImagesIo<Image>) {
  return {
    /** La imagen entera al portapapeles del sistema (no la miniatura que ve la página). */
    async copy(request: OpenExternalFileRequest): Promise<void> {
      const file = await resolveImage(io, request)
      const image = io.imageFromPath(file.path)
      // Un formato que el sistema no sabe decodificar (p. ej. AVIF) da una imagen vacía.
      if (image.isEmpty()) throw new EngineCommandError('UNSUPPORTED_IMAGE', 'the image format cannot be copied')
      // En PNG: cualquier aplicación lo pega, venga la imagen en JPEG, WebP o GIF.
      await io.writePng(image.toPNG())
    },
    /** La persona elige dónde; se copia el archivo tal cual, sin recomprimir. */
    async save(request: OpenExternalFileRequest): Promise<{ saved: boolean }> {
      const file = await resolveImage(io, request)
      const extension = extname(file.name).slice(1).toLowerCase()
      const choice = await io.showSaveDialog({
        title: io.saveTitle(),
        defaultPath: io.join(io.downloadsDir(), file.name),
        filters: extension ? [{ name: extension.toUpperCase(), extensions: [extension] }] : [],
      })
      if (choice.canceled || !choice.filePath) return { saved: false }
      await io.copyFile(file.path, choice.filePath)
      return { saved: true }
    },
  }
}

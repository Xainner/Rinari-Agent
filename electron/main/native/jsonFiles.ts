/**
 * Guardar y abrir un archivo JSON con el diálogo nativo (exportar e importar
 * la memoria, por ahora).
 *
 * Intención estrecha: el renderer no nombra rutas. Para guardar entrega el
 * texto y un nombre sugerido; para abrir no entrega nada. La única ruta que se
 * escribe o se lee es la que la persona eligió en el diálogo, siempre `.json`
 * y con un tamaño máximo; main comprueba además que el texto sea JSON.
 */

import { app, dialog, type BrowserWindow, type OpenDialogOptions, type SaveDialogOptions } from 'electron'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

import {
  JSON_FILE_MAX_BYTES,
  type OpenJsonRequest,
  type OpenJsonResult,
  type SaveJsonRequest,
  type SaveJsonResult,
} from '../../shared/contracts'
import { ValidationError } from '../../shared/validation'

/** Error con código estable: el renderer lo traduce, no lee el mensaje. */
export class JsonFileError extends Error {
  constructor(
    readonly code: 'FILE_TOO_LARGE' | 'INVALID_FILE',
    message: string,
  ) {
    super(message)
  }
}

// Un nombre de archivo, no una ruta: sin separadores ni caracteres que
// Windows reserva, y terminado en `.json`.
const FILE_NAME = /^(?!\.)[^\\/:*?"<>|\u0000-\u001f]{1,120}\.json$/i

function assertTitle(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || value.length > 200) throw new ValidationError('title must be a string up to 200 chars')
  return value
}

function assertJsonText(contents: string): void {
  if (Buffer.byteLength(contents, 'utf8') > JSON_FILE_MAX_BYTES) {
    throw new JsonFileError('FILE_TOO_LARGE', `file is larger than ${JSON_FILE_MAX_BYTES} bytes`)
  }
  try {
    JSON.parse(contents)
  } catch {
    throw new JsonFileError('INVALID_FILE', 'file is not valid JSON')
  }
}

export function assertSaveJson(value: unknown): SaveJsonRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('request must be an object')
  const raw = value as Record<string, unknown>
  if (typeof raw.suggestedName !== 'string' || !FILE_NAME.test(raw.suggestedName)) {
    throw new ValidationError('suggestedName must be a file name ending in .json')
  }
  if (typeof raw.contents !== 'string') throw new ValidationError('contents must be a string')
  assertJsonText(raw.contents)
  return { suggestedName: raw.suggestedName, contents: raw.contents, title: assertTitle(raw.title) }
}

export function assertOpenJson(value: unknown): OpenJsonRequest {
  if (value === undefined || value === null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('request must be an object')
  return { title: assertTitle((value as Record<string, unknown>).title) }
}

/** Lo que toca el sistema; las pruebas lo sustituyen. */
export interface JsonFileIo {
  showSaveDialog(window: BrowserWindow | null, options: SaveDialogOptions): Promise<{ canceled: boolean; filePath?: string }>
  showOpenDialog(window: BrowserWindow | null, options: OpenDialogOptions): Promise<{ canceled: boolean; filePaths: string[] }>
  documentsDir(): string
  size(path: string): Promise<number>
  read(path: string): Promise<string>
  write(path: string, contents: string): Promise<void>
}

const electronIo: JsonFileIo = {
  showSaveDialog: (window, options) => (window ? dialog.showSaveDialog(window, options) : dialog.showSaveDialog(options)),
  showOpenDialog: (window, options) => (window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options)),
  documentsDir: () => app.getPath('documents'),
  size: async (path) => (await stat(path)).size,
  read: (path) => readFile(path, 'utf8'),
  write: (path, contents) => writeFile(path, contents, 'utf8'),
}

const FILTERS = [{ name: 'JSON', extensions: ['json'] }]

export function createJsonFiles(getWindow: () => BrowserWindow | null, io: JsonFileIo = electronIo) {
  return {
    async save(request: SaveJsonRequest): Promise<SaveJsonResult> {
      const choice = await io.showSaveDialog(getWindow(), {
        title: request.title,
        defaultPath: join(io.documentsDir(), request.suggestedName),
        filters: FILTERS,
      })
      if (choice.canceled || !choice.filePath) return { saved: false }
      // Lo que se escribe es siempre un `.json`, aunque se escriba otro nombre.
      const path = extname(choice.filePath).toLowerCase() === '.json' ? choice.filePath : `${choice.filePath}.json`
      await io.write(path, request.contents)
      return { saved: true, name: basename(path) }
    },

    async open(request: OpenJsonRequest): Promise<OpenJsonResult | null> {
      const choice = await io.showOpenDialog(getWindow(), { title: request.title, properties: ['openFile'], filters: FILTERS })
      const path = choice.filePaths[0]
      if (choice.canceled || !path) return null
      if (extname(path).toLowerCase() !== '.json') throw new JsonFileError('INVALID_FILE', 'only .json files can be opened')
      // El tamaño se mira antes de leer: un archivo enorme no llega a memoria.
      if ((await io.size(path)) > JSON_FILE_MAX_BYTES) {
        throw new JsonFileError('FILE_TOO_LARGE', `file is larger than ${JSON_FILE_MAX_BYTES} bytes`)
      }
      const contents = (await io.read(path)).replace(/^﻿/, '')
      assertJsonText(contents)
      return { name: basename(path), contents }
    },
  }
}

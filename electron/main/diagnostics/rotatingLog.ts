/**
 * Registro en disco que rota por tamaño: `app.log`, `app.1.log`… `app.N.log`.
 *
 * Escribe en orden y sin bloquear el hilo principal; un fallo de disco nunca
 * se propaga a quien registra (un diagnóstico no puede tumbar la app). Cada
 * línea pasa por la redacción antes de llegar al archivo.
 */
import { appendFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { redact as defaultRedact } from './redact'

export type LogLevel = 'info' | 'warn' | 'error'

export interface RotatingLogOptions {
  dir: string
  name: string
  /** Tamaño a partir del cual el archivo actual pasa a `.1`. */
  maxBytes?: number
  /** Archivos rotados que se conservan, además del actual. */
  keep?: number
  /** Longitud máxima de una línea: una salida enorme no ocupa el registro entero. */
  maxLineChars?: number
  redact?: (text: string) => string
  now?: () => Date
}

export class RotatingLog {
  readonly path: string
  private readonly maxBytes: number
  private readonly keep: number
  private readonly maxLineChars: number
  private readonly redact: (text: string) => string
  private readonly now: () => Date
  private chain: Promise<void> = Promise.resolve()
  private size: number | null = null

  constructor(private readonly options: RotatingLogOptions) {
    this.path = join(options.dir, `${options.name}.log`)
    this.maxBytes = options.maxBytes ?? 2 * 1024 * 1024
    this.keep = options.keep ?? 4
    this.maxLineChars = options.maxLineChars ?? 4_000
    this.redact = options.redact ?? defaultRedact
    this.now = options.now ?? (() => new Date())
  }

  /** Archivos de este registro, del más reciente al más antiguo. */
  files(): string[] {
    return [this.path, ...Array.from({ length: this.keep }, (_, index) => this.rotated(index + 1))]
  }

  write(level: LogLevel, text: string): void {
    const clean = this.redact(text).replace(/\r?\n/g, ' ⏎ ')
    const bounded = clean.length > this.maxLineChars ? `${clean.slice(0, this.maxLineChars)}… (+${clean.length - this.maxLineChars})` : clean
    const line = `${this.now().toISOString()} ${level.toUpperCase().padEnd(5)} ${bounded}\n`
    this.chain = this.chain.then(() => this.append(line)).catch(() => {})
  }

  /** Espera a que lo escrito hasta ahora esté en disco (export y tests). */
  flush(): Promise<void> {
    return this.chain
  }

  private rotated(index: number): string {
    return join(this.options.dir, `${this.options.name}.${index}.log`)
  }

  private async append(line: string): Promise<void> {
    if (this.size === null) {
      await mkdir(this.options.dir, { recursive: true })
      this.size = await stat(this.path).then((info) => info.size, () => 0)
    }
    const bytes = Buffer.byteLength(line)
    if (this.size > 0 && this.size + bytes > this.maxBytes) await this.rotate()
    await appendFile(this.path, line, 'utf8')
    this.size += bytes
  }

  private async rotate(): Promise<void> {
    await rm(this.rotated(this.keep), { force: true })
    for (let index = this.keep - 1; index >= 1; index--) {
      await rename(this.rotated(index), this.rotated(index + 1)).catch(() => {})
    }
    await rename(this.path, this.rotated(1)).catch(() => {})
    this.size = 0
  }
}

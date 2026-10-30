/**
 * «Exportar para revisión» (plan 0.4.0 #79): el paquete de una conversación.
 *
 * El Engine entrega su parte (eventos, mensajes, uso, entorno, LEEME) ya sin
 * secretos; aquí se añaden las líneas de `app.log` y `engine.log` de esas
 * horas (con margen) y se arma el .zip. Todo pasa otra vez por la redacción.
 */
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

import { redact as defaultRedact } from './redact'
import { createZip, type ZipEntry } from './zip'

/** Minutos de margen antes y después del intervalo de la conversación. */
const MARGIN_MS = 10 * 60 * 1000
const STAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s/

export interface ReviewPackage {
  files: Record<string, string>
  /** ISO de la primera y la última actividad; sin ellas, no van registros. */
  from?: string | null
  to?: string | null
  includeLogs: boolean
}

/** Las líneas de un registro dentro del intervalo; las continuaciones van con su línea. */
export function linesBetween(text: string, from: number, to: number): string {
  const out: string[] = []
  let keep = false
  for (const line of text.split('\n')) {
    const match = STAMP.exec(line)
    if (match) {
      const at = Date.parse(match[1])
      keep = at >= from - MARGIN_MS && at <= to + MARGIN_MS
    }
    if (keep && line) out.push(line)
  }
  return out.join('\n')
}

export async function buildReviewZip(
  review: ReviewPackage,
  logFiles: readonly string[],
  redact: (text: string) => string = defaultRedact,
): Promise<Buffer> {
  const entries: ZipEntry[] = Object.entries(review.files).map(([name, data]) => ({ name, data: redact(data) }))
  const from = review.from ? Date.parse(review.from) : NaN
  const to = review.to ? Date.parse(review.to) : NaN
  if (review.includeLogs && Number.isFinite(from) && Number.isFinite(to)) {
    for (const path of logFiles) {
      let text: string
      try {
        text = await readFile(path, 'utf8')
      } catch {
        continue
      }
      const slice = linesBetween(text, from, to)
      if (slice) entries.push({ name: `logs/${basename(path)}`, data: redact(slice) })
    }
  }
  return createZip(entries)
}

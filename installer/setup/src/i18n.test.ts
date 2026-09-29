// Los mensajes de progreso los emite el instalador en Rust, en inglés; la
// interfaz los traduce por su `step`. Un paso nuevo sin traducción volvería a
// mostrarse en inglés con la interfaz en español.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { progressText, translator } from './i18n'

const rust = readFileSync(join(__dirname, '..', 'src-tauri', 'src', 'operations.rs'), 'utf8')

it('cada paso que emite el instalador tiene traducción', () => {
  const calls = [...rust.matchAll(/emit\(\s*[^,]+,\s*[^,]+,\s*"([a-z_]+)",\s*"([a-z_]+)",/g)]
  expect(calls.length).toBeGreaterThan(10)
  const es = translator('es')
  for (const [, , step] of calls) {
    if (step === 'file') continue
    expect(progressText(es, step, 'fallback'), step).not.toBe('fallback')
  }
})

it('una ruta de archivo o un paso desconocido se muestran tal cual', () => {
  const es = translator('es')
  expect(progressText(es, 'file', 'resources/engine/python.exe')).toBe('resources/engine/python.exe')
  expect(progressText(es, undefined, 'Access denied')).toBe('Access denied')
  expect(progressText(es, 'payload_validated', 'Payload 0.2.0 validated')).toBe('Paquete de instalación validado')
})

import { expect, it } from 'vitest'
import { formatTool, toolCategory } from './formatActivity'
import type { ToolTimelineItem } from './types'

const tool = (name: string, args: Record<string, unknown> = {}, status: ToolTimelineItem['status'] = 'completed') =>
  ({ id: name, type: 'tool', tool: name, arguments: JSON.stringify(args), status, occurredAt: 0 }) as unknown as ToolTimelineItem

it('registrar evidencia de verificación no se presenta como «ejecutó pruebas»', () => {
  // Así se veía en la grabación: `verify.record` contenía «verify» y caía en
  // la categoría de pruebas, con 0.0 s porque sólo guarda evidencia.
  expect(toolCategory('verify.record')).toBe('verify')
  expect(formatTool(tool('verify.record'), 'en')).toBe('Recorded verification evidence')
  expect(formatTool(tool('verify.plan'), 'es')).toBe('Planificó la verificación')
})

it('una herramienta desconocida muestra su nombre, no «ejecutó un comando»', () => {
  expect(toolCategory('schedule.propose')).toBe('other')
  expect(formatTool(tool('schedule.propose'), 'en')).toBe('Used schedule.propose')
  expect(formatTool(tool('shell.exec', { command: 'npm test' }), 'en')).toBe('Ran a command')
})

it('clasifica por nombre exacto o familia, no por palabras sueltas', () => {
  // «list» dentro de `skills.list` no lo convierte en un listado de archivos.
  expect(toolCategory('skills.list')).toBe('skill')
  expect(toolCategory('git.diff')).toBe('git')
  expect(toolCategory('fs.patch')).toBe('edit')
  expect(toolCategory('search.regex')).toBe('search')
  expect(formatTool(tool('browser.open', { url: 'https://rinari.ai/docs' }), 'en')).toBe('Opened rinari.ai')
  expect(formatTool(tool('web.search', { query: 'vite csp' }), 'es')).toBe('Buscó en la web “vite csp”')
})

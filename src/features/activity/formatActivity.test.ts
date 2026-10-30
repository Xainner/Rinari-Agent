import { expect, it } from 'vitest'
import { agentInstruction, formatTool, toolCategory } from './formatActivity'
import type { ToolTimelineItem } from './types'
import { formatWhen } from '../schedules/scheduleModel'
import { en } from '../../i18n/en'
import { es } from '../../i18n/es'
import source from './formatActivity.ts?raw'

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
  expect(toolCategory('telemetry.ping')).toBe('other')
  expect(formatTool(tool('telemetry.ping'), 'en')).toBe('Used telemetry.ping')
  expect(formatTool(tool('shell.exec', { command: 'npm test' }), 'en')).toBe('Ran a command')
})

it('una tarea programada dice lo que quedó según el resultado, no lo que diga el modelo', () => {
  const args = { name: 'Revisar el precio' }
  const created = { ...tool('schedule.propose', args), presentation: { kind: 'tool', data: { status: 'created', next_run_local: '2026-10-21 15:03' } } } as ToolTimelineItem
  expect(formatTool(created, 'es')).toBe('Programó «Revisar el precio» · próxima 2026-10-21 15:03')
  const proposed = { ...tool('schedule.propose', args), presentation: { kind: 'tool', data: { status: 'proposed' } } } as ToolTimelineItem
  expect(formatTool(proposed, 'en')).toBe('Proposed to schedule “Revisar el precio”')
  expect(formatTool(tool('schedule.propose', args, 'failed'), 'es')).toBe('No pudo programar «Revisar el precio»')
  expect(formatTool(tool('schedule.propose', {}, 'running'), 'es')).toBe('Programando…')
})

it('la próxima vez de una tarea programada sale del instante, en el idioma de la app', () => {
  const args = { name: 'Revisar el precio' }
  const at = Date.UTC(2026, 9, 21, 18, 3) / 1000
  const created = { ...tool('schedule.propose', args), presentation: { kind: 'tool', data: { status: 'created', next_run_at: at, next_run_local: '2026-10-21 15:03' } } } as ToolTimelineItem
  expect(formatTool(created, 'en')).toBe(`Scheduled “Revisar el precio” · next ${formatWhen(at, 'en')}`)
  expect(formatTool(created, 'es')).toBe(`Programó «Revisar el precio» · próxima ${formatWhen(at, 'es')}`)
})

it('sin «status» (datos recortados) no se presenta como programada ni propuesta', () => {
  const args = { name: 'Revisar el precio' }
  const trimmed = { ...tool('schedule.propose', args), presentation: { kind: 'tool', data: { next_run_local: '2026-10-21 15:03' } } } as ToolTimelineItem
  expect(formatTool(trimmed, 'es')).toBe('Pidió programar «Revisar el precio»')
  expect(formatTool(trimmed, 'en')).toBe('Asked to schedule “Revisar el precio”')
  expect(formatTool(tool('schedule.propose', args), 'es')).toBe('Pidió programar «Revisar el precio»')
})

it('una memoria rechazada o pendiente no se presenta como guardada', () => {
  expect(formatTool(tool('memory.remember', {}, 'failed'), 'es')).toBe('No pudo guardar en su memoria')
  const pending = { ...tool('memory.remember'), presentation: { kind: 'tool', data: { pending: true } } } as ToolTimelineItem
  expect(formatTool(pending, 'en')).toBe('Proposed a memory for your approval')
  expect(formatTool(tool('memory.remember'), 'es')).toBe('Actualizó su memoria')
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

it('las instrucciones a un subagente dicen a cuál y qué se le pidió', () => {
  const sent = tool('agent.message', { agent_id: 'agt_012', text: '  Revisa también los tests de integración.  ' })
  expect(formatTool(sent, 'es')).toBe('Envió instrucciones al subagente agt_012')
  expect(agentInstruction(sent)).toEqual({ agentId: 'agt_012', text: 'Revisa también los tests de integración.' })
  expect(agentInstruction(tool('agent.message', { agent_id: 'agt_012' }))).toBeNull()
  expect(agentInstruction(tool('agent.status', { agent_id: 'agt_012', text: 'x' }))).toBeNull()
})

it('las esperas dicen qué esperaron y una relectura sin cambios se distingue', () => {
  expect(formatTool(tool('wait.for', { port: 5173 }), 'es')).toBe('Esperó el puerto 5173')
  expect(formatTool(tool('wait.for', { url: 'http://localhost:3000/health' }, 'running'), 'es')).toBe('Esperando localhost:3000…')
  expect(formatTool(tool('wait.for', { output: 'ready', handle: 'proc_001' }), 'en')).toBe('Waited for text in a process output')
  const unchanged = { ...tool('fs.read', { path: 'src/app.ts' }), presentation: { kind: 'tool', data: { unchanged: true } } } as ToolTimelineItem
  expect(formatTool(unchanged, 'es')).toBe('Leyó app.ts (sin cambios)')
})

it('las herramientas de imágenes dicen qué hicieron, no su nombre técnico (plan 0.4.0 #28)', () => {
  expect(toolCategory('image.generate')).toBe('create')
  expect(formatTool(tool('image.generate'), 'es')).toBe('Creó una imagen')
  expect(formatTool(tool('image.generate', {}, 'running'), 'es')).toBe('Creando una imagen…')
  expect(formatTool(tool('image.remove_background'), 'en')).toBe('Removed an image background')
  expect(formatTool(tool('image.upscale', {}, 'failed'), 'es')).toBe('No pudo ampliar la imagen')
  // Leer una imagen sigue siendo leer.
  expect(toolCategory('fs.read_image')).toBe('image')
})

it('cada categoría de herramienta tiene el nombre de su grupo en los dos idiomas', () => {
  // El grupo plegado de image.generate se veía como «activity.group.create».
  const union = source.slice(source.indexOf('export type ToolCategory ='), source.indexOf('const EXACT'))
  const categories = [...union.matchAll(/'([a-z]+)'/g)].map((match) => match[1])
  expect(categories).toContain('create')
  for (const category of categories) {
    expect(es).toHaveProperty([`activity.group.${category}`])
    expect(en).toHaveProperty([`activity.group.${category}`])
  }
})

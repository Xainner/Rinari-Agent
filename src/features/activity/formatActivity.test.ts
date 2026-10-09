import { expect, it } from 'vitest'
import { agentInstruction, formatTool, toolCategory } from './formatActivity'
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

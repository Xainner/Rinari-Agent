import type { Language } from '../../types'
import type { ToolTimelineItem } from './types'

/**
 * Cómo se presenta cada herramienta en la actividad.
 *
 * Por **nombre exacto o familia declarada** (`fs.`, `git.`, `browser.`…), no
 * buscando palabras dentro del nombre: así `verify.record` se presentaba como
 * «Ejecutó pruebas» (contenía «verify») y cualquier herramienta desconocida
 * como «Ejecutó un comando». Lo que no está aquí se muestra con su nombre.
 */
export type ToolCategory =
  | 'image'
  | 'create'
  | 'read'
  | 'search'
  | 'list'
  | 'edit'
  | 'git'
  | 'command'
  | 'verify'
  | 'browser'
  | 'web'
  | 'skill'
  | 'memory'
  | 'code'
  | 'ask'
  | 'other'

const EXACT: Record<string, ToolCategory> = {
  'fs.read_image': 'image',
  'fs.read': 'read',
  'fs.read_lines': 'read',
  'fs.stat': 'read',
  'artifact.read': 'read',
  'artifact.metadata': 'read',
  'context.retrieve': 'read',
  'fs.list': 'list',
  'fs.glob': 'list',
  'search.files': 'list',
  'fs.search_text': 'search',
  'fs.write': 'edit',
  'fs.patch': 'edit',
  'fs.diff': 'git',
  'shell.exec': 'command',
  'user.ask': 'ask',
  // Crear y editar imágenes con un servicio (plan 0.4.0 #28).
  'image.generate': 'create',
  'image.edit': 'create',
  'image.variations': 'create',
  'image.upscale': 'create',
  'image.remove_background': 'create',
}

/** Qué hizo cada herramienta de imágenes: terminado, en curso, fallido. */
const CREATE: Record<string, [[string, string], [string, string], [string, string]]> = {
  'image.generate': [['Creó una imagen', 'Created an image'], ['Creando una imagen…', 'Creating an image…'], ['No pudo crear la imagen', 'Could not create the image']],
  'image.edit': [['Editó una imagen', 'Edited an image'], ['Editando una imagen…', 'Editing an image…'], ['No pudo editar la imagen', 'Could not edit the image']],
  'image.variations': [['Creó variaciones de una imagen', 'Made variations of an image'], ['Creando variaciones…', 'Making variations…'], ['No pudo crear las variaciones', 'Could not make the variations']],
  'image.upscale': [['Amplió una imagen', 'Upscaled an image'], ['Ampliando una imagen…', 'Upscaling an image…'], ['No pudo ampliar la imagen', 'Could not upscale the image']],
  'image.remove_background': [['Quitó el fondo de una imagen', 'Removed an image background'], ['Quitando el fondo…', 'Removing the background…'], ['No pudo quitar el fondo', 'Could not remove the background']],
}

const FAMILY: Record<string, ToolCategory> = {
  search: 'search',
  git: 'git',
  process: 'command',
  pty: 'command',
  verify: 'verify',
  browser: 'browser',
  web: 'web',
  http: 'web',
  skills: 'skill',
  capability: 'skill',
  memory: 'memory',
  lsp: 'code',
}

export function toolCategory(tool: string): ToolCategory {
  const exact = EXACT[tool]
  if (exact) return exact
  const family = tool.includes('.') ? tool.slice(0, tool.indexOf('.')) : ''
  return FAMILY[family] ?? 'other'
}

function details(item: ToolTimelineItem): Record<string, unknown> {
  try {
    return item.arguments ? JSON.parse(item.arguments) as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

/** Lo que el agente principal le escribió a un subagente con `agent.message`. */
export function agentInstruction(item: ToolTimelineItem): { agentId: string; text: string } | null {
  if (item.tool !== 'agent.message') return null
  const args = details(item)
  const text = typeof args.text === 'string' ? args.text.trim() : ''
  return text ? { agentId: typeof args.agent_id === 'string' ? args.agent_id : '', text } : null
}

/** `wait.for`: qué esperó (un puerto, una URL, un texto en un proceso o un archivo). */
function waitLabel(args: Record<string, unknown>, status: ToolTimelineItem['status'], es: boolean): string {
  const what = args.port !== undefined
    ? (es ? `el puerto ${String(args.port)}` : `port ${String(args.port)}`)
    : typeof args.url === 'string' ? (host(args.url) || args.url)
      : args.output !== undefined ? (es ? 'un texto en la salida de un proceso' : 'text in a process output')
        : typeof args.file === 'string' ? basename(args.file)
          : (es ? 'una condición' : 'a condition')
  if (status === 'requested' || status === 'running') return es ? `Esperando ${what}…` : `Waiting for ${what}…`
  return es ? `Esperó ${what}` : `Waited for ${what}`
}

function basename(value: unknown): string {
  const text = typeof value === 'string' ? value : ''
  return text.split(/[\\/]/).filter(Boolean).at(-1) ?? text
}

function host(value: unknown): string {
  if (typeof value !== 'string') return ''
  try {
    return new URL(value).host
  } catch {
    return ''
  }
}

type Pair = [es: string, en: string]

const AGENT: Record<string, Pair> = {
  spawn: ['Lanzó un subagente', 'Started a subagent'],
  wait: ['Esperó al subagente', 'Waited for subagent'],
  result: ['Consultó el resultado del subagente', 'Read subagent result'],
  status: ['Consultó el estado del subagente', 'Checked subagent status'],
  message: ['Envió instrucciones al subagente', 'Sent instructions to subagent'],
  cancel: ['Solicitó detener al subagente', 'Requested subagent cancellation'],
  synthesize: ['Revisó resultados de subagentes', 'Reviewed subagent results'],
}

const GIT: Record<string, Pair> = {
  'git.status': ['Revisó el estado Git', 'Checked Git status'],
  'git.diff': ['Revisó los cambios', 'Reviewed the changes'],
  'fs.diff': ['Comparó archivos', 'Compared files'],
  'git.log': ['Leyó el historial Git', 'Read Git history'],
  'git.show': ['Inspeccionó un commit', 'Inspected a commit'],
  'git.branch': ['Revisó las ramas', 'Checked branches'],
}

const VERIFY: Record<string, Pair> = {
  'verify.plan': ['Planificó la verificación', 'Planned verification'],
  'verify.record': ['Registró evidencia de verificación', 'Recorded verification evidence'],
  'verify.evaluate': ['Evaluó la verificación', 'Evaluated verification'],
}

const BROWSER_LOOK = new Set(['browser.snapshot', 'browser.screenshot', 'browser.a11y', 'browser.console', 'browser.network'])
const BROWSER_ACT = new Set([
  'browser.click', 'browser.type', 'browser.fill', 'browser.select', 'browser.drag',
  'browser.scroll', 'browser.upload', 'browser.check', 'browser.evaluate',
])

export function formatTool(item: ToolTimelineItem, lang: Language): string {
  const es = lang === 'es'
  const pick = ([spanish, english]: Pair) => (es ? spanish : english)
  const args = details(item)
  if (item.tool.startsWith('agent.')) {
    const label = AGENT[item.tool.slice('agent.'.length)]
    const agentId = typeof args.agent_id === 'string' ? args.agent_id : ''
    if (label && item.tool === 'agent.message' && agentId) return `${pick(label)} ${agentId}`
    return label ? pick(label) : item.tool
  }
  if (item.tool === 'wait.for') return waitLabel(args, item.status, es)
  // Child sessions (plan-sesiones-hijas 5): the title of the task names it.
  if (item.tool === 'session.start' || item.tool === 'session.offer') {
    const title = typeof args.title === 'string' ? args.title : ''
    const opened = item.tool === 'session.start'
    if (!title) return pick(opened ? ['Abrió una sesión hija', 'Opened a child session'] : ['Propuso una sesión nueva', 'Offered a new session'])
    return opened ? (es ? `Abrió la sesión «${title}»` : `Opened the session “${title}”`) : (es ? `Propuso «${title}» en una sesión nueva` : `Offered “${title}” as a new session`)
  }
  if (item.tool === 'session.message') return pick(['Escribió a una sesión hija', 'Wrote to a child session'])
  if (item.tool === 'session.children') return pick(['Revisó sus sesiones hijas', 'Checked its child sessions'])
  const target = basename(args.path ?? args.file ?? args.cwd)
  const query = String(args.query ?? args.pattern ?? '').trim()
  const site = host(args.url)
  const category = toolCategory(item.tool)
  switch (category) {
    case 'create': {
      const [done, running, failed] = CREATE[item.tool]
      if (item.status === 'failed' || item.status === 'cancelled') return pick(failed)
      return item.status === 'completed' ? pick(done) : pick(running)
    }
    case 'image':
      if (item.status === 'failed' || item.status === 'cancelled') return pick(['No pudo ver la imagen', 'Could not view image'])
      return item.status === 'completed' ? pick(['Cargó una imagen', 'Loaded an image']) : pick(['Cargando una imagen…', 'Loading an image…'])
    case 'read': {
      // Releído sin cambios: el Engine no lo reenvió al modelo.
      const unchanged = (item.presentation?.data as { unchanged?: unknown } | undefined)?.unchanged === true
      const label = es ? `Leyó ${target || 'un archivo'}` : `Read ${target || 'a file'}`
      return unchanged ? `${label} ${es ? '(sin cambios)' : '(unchanged)'}` : label
    }
    case 'search':
      if (query) return es ? `Buscó “${query}”` : `Searched for “${query}”`
      return pick(['Buscó en el proyecto', 'Searched the project'])
    case 'list':
      return pick(['Listó archivos del proyecto', 'Listed project files'])
    case 'edit':
      return es ? `Editó ${target || 'un archivo'}` : `Edited ${target || 'a file'}`
    case 'git':
      return pick(GIT[item.tool] ?? ['Consultó Git', 'Checked Git'])
    case 'command':
      if (item.tool === 'process.start') return pick(['Inició un proceso', 'Started a process'])
      if (item.tool.startsWith('process.') || item.tool.startsWith('pty.')) return pick(['Consultó un proceso', 'Checked a process'])
      return pick(['Ejecutó un comando', 'Ran a command'])
    case 'verify':
      return pick(VERIFY[item.tool] ?? ['Verificó el trabajo', 'Checked the work'])
    case 'browser':
      if (item.tool === 'browser.open' || item.tool === 'browser.navigate') {
        return site ? (es ? `Abrió ${site}` : `Opened ${site}`) : pick(['Abrió una página', 'Opened a page'])
      }
      if (BROWSER_LOOK.has(item.tool)) return pick(['Miró la página', 'Looked at the page'])
      if (BROWSER_ACT.has(item.tool)) return pick(['Interactuó con la página', 'Interacted with the page'])
      return pick(['Usó el navegador', 'Used the browser'])
    case 'web':
      if (item.tool === 'web.search') return query ? (es ? `Buscó en la web “${query}”` : `Searched the web for “${query}”`) : pick(['Buscó en la web', 'Searched the web'])
      return site ? (es ? `Leyó ${site}` : `Read ${site}`) : pick(['Consultó la web', 'Used the web'])
    case 'skill': {
      const name = typeof args.name === 'string' ? args.name : ''
      if (item.tool === 'skills.activate' || item.tool === 'capability.activate') {
        return name ? (es ? `Activó la skill ${name}` : `Activated skill ${name}`) : pick(['Activó una skill', 'Activated a skill'])
      }
      return pick(['Consultó sus skills', 'Checked its skills'])
    }
    case 'memory': {
      if (item.tool === 'memory.recall') return pick(['Recordó', 'Recalled from memory'])
      // Lo que no se guardó no se presenta como guardado: un rechazo decía
      // «Actualizó su memoria» con el icono de error al lado.
      if (item.status === 'failed' || item.status === 'cancelled') return pick(['No pudo guardar en su memoria', 'Could not save to memory'])
      const data = item.presentation?.data as { pending?: unknown } | undefined
      if (data?.pending === true) return pick(['Propuso un recuerdo para tu aprobación', 'Proposed a memory for your approval'])
      if (item.tool === 'memory.episodic') return pick(['Anotó un resumen de la tarea', 'Noted a task summary'])
      return pick(['Actualizó su memoria', 'Updated its memory'])
    }
    case 'code':
      return pick(['Analizó el código', 'Analyzed the code'])
    case 'ask':
      return pick(['Te hizo una pregunta', 'Asked you a question'])
    default:
      return es ? `Usó ${item.tool}` : `Used ${item.tool}`
  }
}

import type { Language } from '../../types'
import type { ToolTimelineItem } from './types'

export type ToolCategory = 'image' | 'read' | 'search' | 'list' | 'edit' | 'test' | 'git' | 'command'

function details(item: ToolTimelineItem): Record<string, unknown> {
  try {
    return item.arguments ? JSON.parse(item.arguments) as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function basename(value: unknown): string {
  const text = typeof value === 'string' ? value : ''
  return text.split(/[\\/]/).filter(Boolean).at(-1) ?? text
}

export function toolCategory(tool: string): ToolCategory {
  const value = tool.toLowerCase()
  if (value === 'fs.read_image') return 'image'
  if (value.includes('search') || value.includes('grep') || value.includes('find')) return 'search'
  if (value.includes('list') || value.includes('glob')) return 'list'
  if (value.includes('read') || value.includes('open')) return 'read'
  if (value.includes('edit') || value.includes('write') || value.includes('patch')) return 'edit'
  if (value.includes('test') || value.includes('verify')) return 'test'
  if (value.includes('git')) return 'git'
  return 'command'
}

export function formatTool(item: ToolTimelineItem, lang: Language): string {
  const args = details(item)
  if (item.tool.startsWith('agent.')) {
    const action = item.tool.slice('agent.'.length)
    const labels: Record<string, [string, string]> = {
      spawn: ['Lanzó un subagente', 'Started a subagent'],
      wait: ['Esperó al subagente', 'Waited for subagent'],
      result: ['Consultó el resultado del subagente', 'Read subagent result'],
      status: ['Consultó el estado del subagente', 'Checked subagent status'],
      message: ['Envió instrucciones al subagente', 'Sent instructions to subagent'],
      cancel: ['Solicitó detener al subagente', 'Requested subagent cancellation'],
      synthesize: ['Revisó resultados de subagentes', 'Reviewed subagent results'],
    }
    return labels[action]?.[lang === 'es' ? 0 : 1] ?? item.tool
  }
  const target = basename(args.path ?? args.file ?? args.cwd)
  const query = String(args.query ?? args.pattern ?? '').trim()
  const category = toolCategory(item.tool)
  if (category === 'image') {
    if (item.status === 'failed' || item.status === 'cancelled') return lang === 'es' ? 'No pudo ver la imagen' : 'Could not view image'
    return lang === 'es' ? (item.status === 'completed' ? 'Cargó una imagen' : 'Cargando una imagen…') : (item.status === 'completed' ? 'Loaded an image' : 'Loading an image…')
  }
  if (lang === 'en') {
    if (category === 'read') return `Read ${target || 'a file'}`
    if (category === 'search') return query ? `Searched for “${query}”` : 'Searched the project'
    if (category === 'list') return 'Listed project files'
    if (category === 'edit') return `Edited ${target || 'a file'}`
    if (category === 'test') return 'Ran tests'
    if (category === 'git') return 'Checked Git status'
    return 'Ran a command'
  }
  if (category === 'read') return `Leyó ${target || 'un archivo'}`
  if (category === 'search') return query ? `Buscó “${query}”` : 'Buscó en el proyecto'
  if (category === 'list') return 'Listó archivos del proyecto'
  if (category === 'edit') return `Editó ${target || 'un archivo'}`
  if (category === 'test') return 'Ejecutó pruebas'
  if (category === 'git') return 'Revisó el estado Git'
  return 'Ejecutó un comando'
}

import type { TurnTimeline } from '../activity/types'

/** Un plan de la conversación: el resultado final de un turno PLAN terminado (plan 0.4.0 #55). */
export interface PlanEntry {
  turnId: string
  /** 1 para un plan nuevo; un ajuste es la versión siguiente de su plan (#55). */
  version: number
  /** El plan que este ajustó, y el comentario del ajuste. */
  parentId: string | null
  comment: string | null
  startedAt: number
  content: string
  title: string
  steps: string[]
  summary: string
  sections: PlanSection[]
}

export interface PlanSection { title: string | null; body: string }

const HEADING = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/
const NUMBERED = /^\s{0,3}\d+[.)]\s+(.+)$/
const BULLET = /^\s{0,3}[-*+]\s+(.+)$/

const plain = (text: string) => text.replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim()

/** Título, pasos, resumen y secciones de un plan en Markdown, sin inventar lo que no dice. */
export function parsePlan(content: string): Omit<PlanEntry, 'turnId' | 'startedAt' | 'content' | 'version' | 'parentId' | 'comment'> {
  const lines = content.split('\n')
  const heading = lines.map((line) => HEADING.exec(line)).find(Boolean)
  const firstLine = lines.find((line) => line.trim())?.trim() ?? ''
  const title = plain(heading ? heading[2] : firstLine).slice(0, 90)
  // Los pasos son la primera lista numerada; si no hay, la de viñetas bajo un «Pasos».
  let steps = lines.map((line) => NUMBERED.exec(line)?.[1]).filter((step): step is string => Boolean(step)).map(plain)
  if (steps.length === 0) {
    let inSteps = false
    for (const line of lines) {
      const match = HEADING.exec(line)
      if (match) { inSteps = /pasos|steps|plan/i.test(match[2]); continue }
      const bullet = inSteps ? BULLET.exec(line)?.[1] : undefined
      if (bullet) steps.push(plain(bullet))
    }
  }
  steps = steps.filter(Boolean)
  const paragraph = content.split(/\n\s*\n/).map((block) => block.trim()).find((block) => block && !HEADING.test(block.split('\n')[0]) && !NUMBERED.test(block.split('\n')[0]) && !BULLET.test(block.split('\n')[0]))
  const summary = plain((paragraph ?? '').replace(/\s+/g, ' ')).slice(0, 220)
  const sections: PlanSection[] = []
  let current: PlanSection = { title: null, body: '' }
  for (const line of lines) {
    const match = HEADING.exec(line)
    // El título ya va arriba: no se repite dentro.
    if (match && match[1].length === 1) continue
    if (match && match[1].length >= 2 && match[1].length <= 3) {
      if (current.body.trim() || current.title) sections.push({ ...current, body: current.body.trim() })
      current = { title: plain(match[2]), body: '' }
      continue
    }
    current.body += `${line}\n`
  }
  if (current.body.trim() || current.title) sections.push({ ...current, body: current.body.trim() })
  return { title, steps, summary, sections }
}

/** Los planes de una conversación, el más reciente primero. */
export function sessionPlans(timelines: Record<string, TurnTimeline>): PlanEntry[] {
  const plans: PlanEntry[] = []
  for (const timeline of Object.values(timelines)) {
    if (timeline.mode !== 'plan' || timeline.status !== 'completed') continue
    const final = [...timeline.items].reverse().find((item) => item.type === 'model' && item.outputKind === 'final' && item.content)
    if (!final || final.type !== 'model' || !final.content) continue
    const adjust = timeline.origin?.source === 'plan_adjust' ? timeline.origin : null
    plans.push({
      turnId: timeline.turnId,
      startedAt: timeline.startedAt,
      content: final.content,
      version: 1,
      parentId: adjust?.plan_turn_id ?? null,
      comment: adjust?.comment ?? null,
      ...parsePlan(final.content),
    })
  }
  const byId = new Map(plans.map((plan) => [plan.turnId, plan]))
  const versionOf = (plan: PlanEntry, seen = new Set<string>()): number => {
    const parent = plan.parentId ? byId.get(plan.parentId) : undefined
    if (!parent || seen.has(parent.turnId)) return 1
    seen.add(plan.turnId)
    return versionOf(parent, seen) + 1
  }
  for (const plan of plans) plan.version = versionOf(plan)
  return plans.sort((a, b) => b.startedAt - a.startedAt)
}

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
  /** Lo que va bajo cada paso (sublista o párrafos sangrados), en Markdown; '' si nada. Mismo orden que `steps`. */
  stepDetails: string[]
  summary: string
  sections: PlanSection[]
}

export interface PlanSection { title: string | null; body: string }

const HEADING = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/
const NUMBERED = /^\s{0,3}\d+[.)]\s+(.+)$/
const BULLET = /^\s{0,3}[-*+]\s+(.+)$/

const indentOf = (line: string) => (/^[ \t]*/.exec(line)?.[0] ?? '').replace(/\t/g, '    ').length

interface RawStep { text: string; detail: string[] }

/**
 * Los pasos de una lista y lo que cuelga de cada uno (H-19). Un paso que
 * acaba en «…sin cambiar el formato:» perdía su sublista. Bajo un paso va lo
 * sangrado más que él, lo que le sigue sin línea en blanco (una sublista a
 * la izquierda o el párrafo que continúa) y, tras una línea en blanco, una
 * viñeta a la izquierda solo si después viene otro paso. Un título o un
 * texto suelto tras una línea en blanco lo cierran. `inScope` dice qué
 * líneas pueden abrir un paso (la lista de viñetas solo cuenta bajo «Pasos»).
 */
function readSteps(lines: string[], marker: RegExp, inScope: (index: number) => boolean): RawStep[] {
  const steps: RawStep[] = []
  let base: number | null = null
  let current: RawStep | null = null
  let gap = false
  const isStep = (index: number) => {
    const line = lines[index]
    return inScope(index) && marker.test(line) && (base === null || indentOf(line) <= base)
  }
  const stepAhead = (from: number) => {
    for (let index = from + 1; index < lines.length; index++) {
      if (HEADING.test(lines[index])) return false
      if (isStep(index)) return true
    }
    return false
  }
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (isStep(index)) {
      base ??= indentOf(line)
      current = { text: marker.exec(line)![1], detail: [] }
      steps.push(current)
      gap = false
      continue
    }
    if (!current) continue
    if (!line.trim()) { gap = true; continue }
    if (HEADING.test(line)) { current = null; continue }
    const nested = indentOf(line) > (base ?? 0)
    if (nested || !gap || (BULLET.test(line) && stepAhead(index))) {
      if (gap && current.detail.length > 0) current.detail.push('')
      current.detail.push(line)
      gap = false
      continue
    }
    current = null
  }
  return steps
}

/** Lo que cuelga de un paso, sin la sangría común. */
function detailText(detail: string[]): string {
  const filled = detail.filter((line) => line.trim())
  if (filled.length === 0) return ''
  const cut = Math.min(...filled.map(indentOf))
  return detail.map((line) => line.replace(/\t/g, '    ').slice(cut)).join('\n').trim()
}

const plain = (text: string) => text.replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim()

/** Título, pasos, resumen y secciones de un plan en Markdown, sin inventar lo que no dice. */
export function parsePlan(content: string): Omit<PlanEntry, 'turnId' | 'startedAt' | 'content' | 'version' | 'parentId' | 'comment'> {
  const lines = content.split('\n')
  const heading = lines.map((line) => HEADING.exec(line)).find(Boolean)
  const firstLine = lines.find((line) => line.trim())?.trim() ?? ''
  const title = plain(heading ? heading[2] : firstLine).slice(0, 90)
  // Los pasos son la lista numerada; si no hay, la de viñetas bajo un «Pasos».
  let raw = readSteps(lines, NUMBERED, () => true)
  if (raw.length === 0) {
    const inSteps: boolean[] = []
    let open = false
    for (const line of lines) {
      const match = HEADING.exec(line)
      if (match) open = /pasos|steps|plan/i.test(match[2])
      inSteps.push(open && !match)
    }
    raw = readSteps(lines, BULLET, (index) => inSteps[index])
  }
  raw = raw.filter((step) => plain(step.text))
  const steps = raw.map((step) => plain(step.text))
  const stepDetails = raw.map((step) => detailText(step.detail))
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
  return { title, steps, stepDetails, summary, sections }
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

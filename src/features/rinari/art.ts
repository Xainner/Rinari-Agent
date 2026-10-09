/**
 * Arte de Rinari empaquetado por Vite (WebP con hash). Las piezas se nombran
 * `exp-<expresión>` (bustos para el avatar) y `chibi-<pose>` (estados vacíos,
 * arranque, avisos). Una pieza que falte cae en otra aprobada, nunca en un
 * hueco: así una expresión nueva puede llegar sin tocar los consumidores.
 *
 * Cómo se genera y revisa el arte: AGENTS.md, «Diseño: arte de Rinari».
 */
const files = import.meta.glob<string>('../../assets/rinari/*.webp', { eager: true, import: 'default' })

const byName: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -'.webp'.length), url]),
)

const pick = (...names: string[]): string => names.map((name) => byName[name]).find(Boolean) ?? ''

export type Expression = 'idle' | 'think' | 'focused' | 'ask' | 'proud' | 'pout' | 'surprised' | 'laugh' | 'listen' | 'sleepy'
export type ChibiPose = 'wave' | 'typing' | 'telescope' | 'plug' | 'sleep' | 'trophy' | 'peek' | 'shield' | 'oops'

export const art = {
  expression: (name: Expression): string => pick(`exp-${name}`, name === 'listen' ? 'exp-focused' : '', name === 'sleepy' ? 'exp-think' : '', 'exp-idle', 'exp-smug', 'avatar'),
  chibi: (name: ChibiPose): string => pick(`chibi-${name}`, name === 'oops' ? 'chibi-peek' : '', 'chibi-wave'),
  installerHero: (): string => pick('installer-hero', 'exp-idle'),
}

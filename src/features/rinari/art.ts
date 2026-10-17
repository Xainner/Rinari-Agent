/**
 * Arte de Rinari empaquetado por Vite (WebP con hash). Las piezas se nombran
 * `exp-<expresión>` (bustos para el avatar) y `chibi-<pose>` (estados vacíos,
 * arranque, avisos); `vn-<pose>` es Rinari de pie y `room`, su cuarto (la
 * bienvenida). Una pieza que falte cae en otra aprobada, nunca en un hueco:
 * así una expresión nueva puede llegar sin tocar los consumidores.
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
/** Rinari de pie, medio cuerpo largo con fondo transparente (`vn-<pose>`), como en la bienvenida del móvil. */
export type StandingPose = 'hello' | 'think' | 'wait' | 'happy' | 'wink'

export const art = {
  expression: (name: Expression): string => pick(`exp-${name}`, name === 'listen' ? 'exp-focused' : '', name === 'sleepy' ? 'exp-think' : '', 'exp-idle', 'exp-smug', 'avatar'),
  chibi: (name: ChibiPose): string => pick(`chibi-${name}`, name === 'oops' ? 'chibi-peek' : '', 'chibi-wave'),
  installerHero: (): string => pick('installer-hero', 'exp-idle'),
  sky: (): string => pick('sky'),
  standing: (name: StandingPose): string => pick(`vn-${name}`, 'vn-hello', 'installer-hero', 'exp-idle'),
  room: (): string => pick('room', 'sky'),
}

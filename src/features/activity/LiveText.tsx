import Markdown from '../../components/Markdown'
import { useCalmMotion } from '../../lib/motion'
import { useSmoothText } from './smoothText'

/**
 * El texto de Rinari mientras llega (plan 0.4.0 #52), en el chat, los paneles
 * de Boards y los subagentes: revelado suave por palabras, que entran con un
 * fundido corto, y el cursor al final. Al terminar el turno se pinta entero y
 * sin animación; con movimiento reducido, tal como llega.
 */
export default function LiveText({ id, content, streaming, live }: { id: string; content: string; streaming: boolean; live: boolean }) {
  const calm = useCalmMotion()
  const { shownTo, fadeFrom, revealing } = useSmoothText(id, content, { streaming, live, reduced: calm })
  return <Markdown stream={revealing ? { fadeFrom, shownTo } : undefined}>{content}</Markdown>
}

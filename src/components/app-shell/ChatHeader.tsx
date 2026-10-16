import { TitleSwap } from '../TitleSwap'

interface ChatHeaderProps {
  /** null = sin sesión activa. */
  title: string | null
  /** La conversación del título: un cambio a otra no se anima. */
  sessionId?: string | null
}

/**
 * La barra de título de una conversación solo lleva su título (plan 0.4.0
 * #83): el proyecto se ve en la barra lateral y en Resumen → Entorno, la rama
 * también en Resumen, y el modo en el composer. Un título largo se recorta con
 * «…» y el completo sale al pasar el ratón. Se monta dentro de `AppStatusBar`;
 * no es un segundo header global.
 */
export default function ChatHeader({ title, sessionId = null }: ChatHeaderProps) {
  if (!title) return null
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2" title={title}>
      <TitleSwap
        as="p"
        sessionId={sessionId}
        text={title}
        className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text)]"
      />
    </div>
  )
}

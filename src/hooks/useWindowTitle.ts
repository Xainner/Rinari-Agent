import { useEffect } from 'react'

export const BASE_WINDOW_TITLE = 'Rinari Agent'

/** Único escritor del título nativo; serializa las escrituras para que una
 * resolución tardía no restaure un contador viejo. */
let chain: Promise<void> = Promise.resolve()
let lastRequested: string | null = null

export function composeWindowTitle(attentionCount: number, base = BASE_WINDOW_TITLE): string {
  return attentionCount > 0 ? `(${attentionCount > 99 ? '99+' : attentionCount}) ${base}` : base
}

async function writeTitle(title: string): Promise<void> {
  if (typeof document !== 'undefined') document.title = title
}

export function setWindowTitle(title: string): Promise<void> {
  lastRequested = title
  chain = chain.then(() => (lastRequested === title ? writeTitle(title) : Promise.resolve()))
  return chain
}

/**
 * `(<N>) Rinari Agent` con el contador real de sesiones del board que
 * requieren atención (unión, no suma). Cambiar de vista no lo borra; al
 * desmontar el escritor o llegar a cero se restaura el título base. No es un
 * badge del taskbar/dock: esa integración no se promete aquí.
 */
export function useWindowTitle(attentionCount: number, base = BASE_WINDOW_TITLE): void {
  useEffect(() => {
    void setWindowTitle(composeWindowTitle(attentionCount, base))
  }, [attentionCount, base])
  useEffect(() => () => {
    void setWindowTitle(base)
  }, [base])
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { engineApi, type SlashCommand } from '../../services/engine'

/** Evento que avisa de cambios en la biblioteca de skills (también son comandos). */
export const SKILLS_CHANGED_EVENT = 'rinari-skills-changed'

/**
 * Catálogo de comandos `/` de la sesión. Se pide al escribir la primera `/`
 * (no en cada render) y se vuelve a pedir si cambia la sesión o las skills.
 * Un Engine sin `slash_commands_v1` responde con error: el menú queda vacío.
 */
export function useSlashCommands(sessionId?: string): [SlashCommand[], () => void] {
  const [commands, setCommands] = useState<SlashCommand[]>([])
  const loadedFor = useRef<string | null>(null)
  const generation = useRef(0)

  const load = useCallback(() => {
    const key = sessionId || ''
    if (loadedFor.current === key) return
    loadedFor.current = key
    const current = ++generation.current
    engineApi.commandList(sessionId || undefined)
      .then(({ commands: next }) => { if (current === generation.current) setCommands(next) })
      .catch(() => { if (current === generation.current) setCommands([]) })
  }, [sessionId])

  useEffect(() => {
    loadedFor.current = null
    const invalidate = () => { loadedFor.current = null }
    window.addEventListener(SKILLS_CHANGED_EVENT, invalidate)
    return () => window.removeEventListener(SKILLS_CHANGED_EVENT, invalidate)
  }, [sessionId])

  return [commands, load]
}

/**
 * Qué proyectos de la barra lateral están desplegados.
 *
 * Por defecto arrancan colapsados, salvo el de la conversación activa. Lo que
 * el usuario abre o cierra a mano se recuerda entre reinicios: antes todos
 * arrancaban desplegados y el colapso se perdía al cerrar la app.
 */
const KEY = 'rinari.projectsExpanded'

export type ProjectExpansion = Record<string, boolean>

export function readProjectExpansion(): ProjectExpansion {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'),
    )
  } catch {
    return {}
  }
}

export function writeProjectExpansion(value: ProjectExpansion): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(value))
  } catch {
    // Sin almacenamiento la barra sigue funcionando; solo no se recuerda.
  }
}

/** Lo elegido a mano manda; si no hay elección, solo el proyecto activo va abierto. */
export function isProjectExpanded(
  choices: ProjectExpansion,
  projectId: string,
  activeProjectId: string | null | undefined,
): boolean {
  return choices[projectId] ?? projectId === activeProjectId
}

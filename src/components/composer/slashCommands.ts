import type { SlashCommand } from '../../services/engine'

/**
 * Comandos `/` del compositor. El catálogo viene del Engine (`command.list`):
 * los mismos que el CLI, más una entrada por skill activa. Aquí solo se
 * reconoce qué escribió el dueño; qué hace cada comando lo decide su `kind`.
 */

/** Nombre parcial mientras se escribe `/nom` (sin espacio aún); null si no aplica. */
export function slashQuery(text: string): string | null {
  const match = /^\/([^\s/]*)$/.exec(text)
  return match ? match[1] : null
}

/** Comandos que coinciden: primero los que empiezan por la consulta, luego los que la contienen. */
export function matchSlashCommands(query: string, commands: readonly SlashCommand[], limit = 12): SlashCommand[] {
  const needle = query.toLowerCase()
  const starts = commands.filter((command) => command.name.startsWith(needle))
  const contains = commands.filter((command) => !command.name.startsWith(needle) && command.name.includes(needle))
  return [...starts, ...contains].slice(0, limit)
}

/** `/nombre resto` → el comando y el texto; null si el nombre no está en el catálogo. */
export function parseSlashCommand(
  text: string,
  commands: readonly SlashCommand[],
): { command: SlashCommand; text: string } | null {
  const match = /^\/([^\s/]+)(?:\s+([\s\S]*))?$/.exec(text.trim())
  if (!match) return null
  const command = commands.find((item) => item.name === match[1].toLowerCase())
  return command ? { command, text: (match[2] ?? '').trim() } : null
}

/** Qué hace el envío con un comando reconocido. */
export type SlashPlan =
  | { kind: 'ui'; name: string; text: string }
  | { kind: 'mode'; mode: string }
  | { kind: 'send'; name: string; text: string }

export function planSlash(command: SlashCommand, text: string): SlashPlan {
  if (command.kind === 'ui') return { kind: 'ui', name: command.name, text }
  // `/plan` sin texto solo cambia el modo; `/review` sin texto usa su plantilla.
  if (command.kind === 'mode' && !text && !command.template && command.mode) return { kind: 'mode', mode: command.mode }
  return { kind: 'send', name: command.name, text }
}

/** Al elegir en el menú: los que no llevan argumentos se ejecutan; el resto se completa. */
export function runsOnPick(command: SlashCommand): boolean {
  return command.args === '' && command.kind !== 'skill'
}

import {
  CircleHelp, Cpu, Eye, FlaskConical, Gauge, GitCompare, GitFork, GraduationCap, Hammer, Library, ListChecks, ListTree,
  Pencil, Plus, Shrink, Sparkles, SquareSlash, type LucideIcon,
} from 'lucide-react'
import { useI18n, type I18nKey } from '../../i18n'
import { cn } from '../../lib/utils'
import type { SlashCommand } from '../../services/engine'

const ICONS: Record<string, LucideIcon> = {
  help: CircleHelp,
  new: Plus,
  plan: ListTree,
  build: Hammer,
  review: Eye,
  test: FlaskConical,
  skill: Sparkles,
  learn: GraduationCap,
  skills: Library,
  compact: Shrink,
  context: Gauge,
  model: Cpu,
  diff: GitCompare,
  tasks: ListChecks,
  fork: GitFork,
  rename: Pencil,
}

/** Primero los comandos de Rinari y después las skills, cada grupo en su orden de coincidencia. */
export function groupSlashCommands(commands: readonly SlashCommand[]): SlashCommand[] {
  return [...commands.filter((command) => command.source !== 'skill'), ...commands.filter((command) => command.source === 'skill')]
}

/**
 * Lista de comandos `/`. Las opciones no toman el foco al pulsarlas (el
 * cursor se queda en el compositor) y el índice resaltado recorre los dos
 * grupos como una sola lista.
 */
export function SlashMenu({ commands, highlight, onHighlight, onPick, descriptions }: {
  commands: SlashCommand[]
  highlight: number
  onHighlight: (index: number) => void
  onPick: (command: SlashCommand) => void
  descriptions: Record<string, I18nKey>
}) {
  const { t } = useI18n()
  const builtins = commands.filter((command) => command.source !== 'skill')
  const skills = commands.filter((command) => command.source === 'skill')
  const row = (command: SlashCommand, index: number) => {
    const Icon = command.source === 'skill' ? Sparkles : ICONS[command.name] ?? SquareSlash
    const key = descriptions[command.name]
    const active = index === highlight
    return (
      <button
        key={`${command.source}:${command.name}`}
        type="button"
        role="option"
        aria-selected={active}
        tabIndex={-1}
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => onHighlight(index)}
        onClick={() => onPick(command)}
        className={cn('slash-row', active && 'is-active')}
        data-source={command.source}
      >
        <span className="slash-icon" aria-hidden="true"><Icon size={14} /></span>
        <span className="slash-text">
          <span className="slash-name">/{command.name}{command.args && <span className="slash-args"> {command.args}</span>}</span>
          <span className="slash-desc">{command.source === 'builtin' && key ? t(key) : command.description}</span>
        </span>
        {active && <span className="slash-enter" aria-hidden="true">↵</span>}
      </button>
    )
  }
  return (
    <div role="listbox" aria-label={t('composer.slash.heading')} data-testid="slash-command-list" className="slash-menu">
      {builtins.length > 0 && (
        <div role="group" aria-label={t('composer.slash.heading')}>
          <p className="slash-group" aria-hidden="true">{t('composer.slash.heading')}</p>
          {builtins.map((command, index) => row(command, index))}
        </div>
      )}
      {skills.length > 0 && (
        <div role="group" aria-label={t('composer.slash.skills')}>
          <p className="slash-group" aria-hidden="true">{t('composer.slash.skills')}<span className="slash-group-count">{skills.length}</span></p>
          {skills.map((command, index) => row(command, builtins.length + index))}
        </div>
      )}
      <p className="slash-hint" aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd> {t('composer.slash.hintMove')} · <kbd>Tab</kbd> {t('composer.slash.hintComplete')} · <kbd>↵</kbd> {t('composer.slash.hintPick')}</p>
    </div>
  )
}

import { Bot, FileText, GitCompareArrows, Globe, NotebookText, SquareTerminal, Workflow, Zap, type LucideIcon } from 'lucide-react'
import type { I18nKey } from '../../i18n'
import type { DockView } from '../../stores/sessionDock'

/** Icono y nombre de cada vista del panel lateral: los mismos en la barra de título y en su cabecera. */
export const DOCK_VIEW_ICONS: Record<DockView, LucideIcon> = {
  browser: Globe,
  terminal: SquareTerminal,
  files: FileText,
  changes: GitCompareArrows,
  agents: Bot,
  flow: Workflow,
  plan: NotebookText,
  rules: Zap,
}

export const DOCK_VIEW_LABELS: Record<DockView, I18nKey> = {
  browser: 'dock.view.browser',
  terminal: 'dock.view.terminal',
  files: 'dock.view.files',
  changes: 'dock.view.changes',
  agents: 'dock.view.agents',
  flow: 'dock.view.flow',
  plan: 'dock.view.plan',
  rules: 'dock.view.rules',
}

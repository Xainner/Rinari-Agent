import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Folder, FolderOpen, MessageCircle, Search } from 'lucide-react'
import { useI18n } from '../../i18n'
import { platform } from '../../platform'
import { engineApi, type ProjectSummary } from '../../services/engine'
import { cn } from '../../lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { useOptionalEngineCommands, useOptionalEngineData } from '../../features/engine/EngineContext'
import { inProfile, useProfileStore } from '../../features/profiles/profileStore'
import { branchLabel } from '../../features/projects/ProjectBranch'
import { useCreateProjectStore } from '../../features/projects/createProjectStore'

/** Abre el selector de proyecto del composer enfocado (atajo de teclado, #42). */
export const PROJECT_PICKER_EVENT = 'rinari:project-picker'

export interface ProjectChipProps {
  /** Proyecto del borrador; `null` es «Sin proyecto» (chat general). */
  projectId: string | null
  onChange: (projectId: string | null) => void
  /** Composer principal: el atajo lo abre si ningún otro composer tiene el foco. */
  primary?: boolean
  disabled?: boolean
}

/**
 * El proyecto de una conversación nueva, elegible antes del primer envío (#42).
 *
 * Solo existe en un borrador: al enviar, la conversación ya existe y se mueve
 * desde la barra lateral. La lista son los proyectos del perfil activo por uso
 * reciente, con buscador y «Abrir carpeta…» (el mismo flujo de «Añadir panel»).
 */
export function ProjectChip({ projectId, onChange, primary = false, disabled = false }: ProjectChipProps) {
  const { t } = useI18n()
  const data = useOptionalEngineData()
  const commands = useOptionalEngineCommands()
  const activeProfile = useProfileStore((state) => state.activeId)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const trigger = useRef<HTMLButtonElement>(null)

  const projects = useMemo(() => (data?.projects ?? [])
    .filter((project) => !project.archived && inProfile(project, activeProfile))
    .sort((a, b) => (b.last_opened_at ?? '').localeCompare(a.last_opened_at ?? '')), [data?.projects, activeProfile])
  const current = projectId ? (data?.projects ?? []).find((project) => project.id === projectId) ?? null : null
  const needle = query.trim().toLowerCase()
  const matching = needle ? projects.filter((project) => `${project.name ?? ''} ${project.root}`.toLowerCase().includes(needle)) : projects
  const branch = branchLabel(current?.git_head ?? null)

  useEffect(() => {
    const onPick = () => {
      if (disabled) return
      const composer = trigger.current?.closest('.composer-root')
      const focused = document.activeElement?.closest('.composer-root')
      if (focused ? focused === composer : primary) setOpen(true)
    }
    window.addEventListener(PROJECT_PICKER_EVENT, onPick)
    return () => window.removeEventListener(PROJECT_PICKER_EVENT, onPick)
  }, [disabled, primary])

  function choose(next: string | null) {
    setOpen(false)
    if (next !== projectId) onChange(next)
  }

  async function openFolder() {
    setOpen(false)
    const picked = (await platform().dialog.openFiles({ directory: true }))?.[0] ?? null
    if (typeof picked !== 'string') return
    // Una carpeta que ya es de un proyecto elige ese proyecto: lo decide el
    // Engine, que compara rutas canónicas.
    const owner = await engineApi.projectFoldersValidate([picked])
      .then((result) => result.folders[0]?.error)
      .catch(() => null)
    if (owner?.code === 'IN_PROJECT' && owner.project_id) {
      choose(owner.project_id)
      return
    }
    useCreateProjectStore.getState().openWith([picked], {
      openSession: false,
      onCreated: (project: ProjectSummary) => {
        void commands?.refreshProjects()
        onChange(project.id)
      },
    })
  }

  const label = current ? (current.name || baseName(current.root)) : t('composer.project.none')
  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) setQuery('') }}>
      <PopoverTrigger asChild>
        <button
          ref={trigger}
          type="button"
          disabled={disabled}
          className="composer-project-chip"
          data-testid="composer-project-chip"
          data-project-id={projectId ?? ''}
          title={t('composer.project.choose')}
          aria-label={`${t('composer.project.choose')}: ${label}`}
        >
          {current ? <Folder size={13} aria-hidden="true" className="composer-chip-icon" /> : <MessageCircle size={13} aria-hidden="true" className="composer-chip-icon" />}
          <span className="composer-chip-label">{label}</span>
          {branch && <span className="composer-project-branch">{branch}</span>}
          <ChevronDown size={12} aria-hidden="true" className="composer-project-caret" />
        </button>
      </PopoverTrigger>
      {/* Hacia arriba: el chip está encima del composer y abrirlo hacia abajo lo tapaba. */}
      <PopoverContent
        side="top"
        align="start"
        className="composer-project-menu flex min-h-0 w-72 flex-col overflow-hidden p-1.5"
        style={{ maxHeight: 'min(28rem, var(--radix-popover-content-available-height))' }}
        data-testid="composer-project-menu"
      >
        <div className="shrink-0 border-b border-[var(--border)] p-1.5">
          <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-1.5 focus-within:border-[var(--border-strong)]">
            <Search size={13} aria-hidden="true" className="text-[var(--text-subtle)]" />
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('composer.project.search')} aria-label={t('composer.project.search')} className="min-w-0 flex-1 border-0 bg-transparent text-xs text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)]" />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1 pr-0.5">
          {!needle && (
            <ProjectRow icon={<MessageCircle size={14} aria-hidden="true" />} title={t('composer.project.none')} detail={t('composer.project.noneDetail')} selected={projectId === null} onClick={() => choose(null)} />
          )}
          {matching.length > 0 && <h3 className="composer-project-heading">{t('composer.project.recent')}</h3>}
          {matching.map((project) => (
            <ProjectRow
              key={project.id}
              icon={<Folder size={14} aria-hidden="true" />}
              title={project.name || baseName(project.root)}
              detail={[branchLabel(project.git_head ?? null), shortPath(project.root)].filter(Boolean).join(' · ')}
              fullDetail={project.root}
              mono
              selected={project.id === projectId}
              onClick={() => choose(project.id)}
            />
          ))}
          {needle && matching.length === 0 && <p className="px-2.5 py-5 text-center text-xs text-[var(--text-subtle)]">{t('composer.project.noneFound')}</p>}
        </div>
        <div className="shrink-0 border-t border-[var(--border)] pt-1">
          <button type="button" onClick={() => void openFolder()} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)]" data-testid="composer-project-open-folder">
            <FolderOpen size={13} aria-hidden="true" /> {t('composer.project.openFolder')}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ProjectRow({ icon, title, detail, fullDetail, mono = false, selected, onClick }: { icon: React.ReactNode; title: string; detail: string; fullDetail?: string; mono?: boolean; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]', selected && 'bg-[var(--bg-subtle)]')} aria-pressed={selected} data-testid="composer-project-option">
      <span className={cn('shrink-0', selected ? 'text-[var(--accent-2)]' : 'text-[var(--text-subtle)]')}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-[var(--text)]">{title}</span>
        {detail && <span className={cn('block truncate text-[11px] text-[var(--text-subtle)]', mono && 'font-mono')} title={fullDetail ?? detail}>{detail}</span>}
      </span>
      {selected && <Check size={14} aria-hidden="true" className="shrink-0 text-[var(--accent-2)]" />}
    </button>
  )
}

const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path

/** La ruta sin el principio cuando es larga: lo que distingue una carpeta es su final. */
function shortPath(path: string): string {
  const separator = path.includes('\\') ? '\\' : '/'
  const parts = path.split(/[\\/]/).filter(Boolean)
  if (parts.length <= 3) return path
  return `…${separator}${parts.slice(-3).join(separator)}`
}

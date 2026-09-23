import { useEffect, useState } from 'react'
import { Archive, ArrowLeft, Copy, FolderGit2, MessageSquare, Pin, Plus, ShieldCheck } from 'lucide-react'
import type {
  ProjectIntelligence,
  ProjectStatus,
  ProjectSummary,
  SessionSummary,
} from '../../services/engine'
import { projectDisplayName } from '../../features/projects/workspaceModel'
import { useI18n } from '../../i18n'
import { copyText } from '../../lib/clipboard'

export interface ProjectHomeProps {
  root: string
  project: ProjectSummary | null
  sessions: SessionSummary[]
  activeId: string
  status: ProjectStatus | null
  statusError: string | null
  intel: ProjectIntelligence | null
  onBack: () => void
  onSelectSession: (id: string) => void
  onNewSession: () => void
  /** Carga perezosa: estado git (siempre) e inteligencia (solo si falta). */
  onEnsure: () => void
  onTrust: () => void
  onUpdate: (changes: { name?: string; description?: string; pinned?: boolean }) => Promise<boolean>
  onArchive: () => void
}

/**
 * Home del proyecto: identidad engine-owned (nombre/root), Git vivo,
 * sesiones del proyecto, metadata editable e inteligencia. La metadata
 * pertenece al engine; nunca se escriben archivos dentro del proyecto.
 */
export default function ProjectHome({
  root,
  project,
  sessions,
  activeId,
  status,
  statusError,
  intel,
  onBack,
  onSelectSession,
  onNewSession,
  onEnsure,
  onTrust,
  onUpdate,
  onArchive,
}: ProjectHomeProps) {
  const { t } = useI18n()
  const [name, setName] = useState(project?.name ?? projectDisplayName(root))
  const [description, setDescription] = useState(project?.description ?? '')

  useEffect(() => {
    setName(project?.name ?? projectDisplayName(root))
    setDescription(project?.description ?? '')
  }, [project, root])

  useEffect(() => {
    onEnsure()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root])

  const git = status?.status ?? null
  const copyPath = () => {
    void copyText(root)
  }

  const commands = intel
    ? [
        intel.repository.build_command,
        intel.repository.test_command,
        intel.repository.lint_command,
        intel.repository.typecheck_command,
      ].filter((c): c is string => c !== null && c !== '')
    : []

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-4 overflow-y-auto px-4 py-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={t('project.back')}
          className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
        >
          <ArrowLeft size={15} />
        </button>
        <FolderGit2 size={16} aria-hidden="true" className="shrink-0 text-[var(--text-subtle)]" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text)]">
          {project?.name || projectDisplayName(root)}
        </h2>
        <button
          type="button"
          onClick={onNewSession}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--bg-hover)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text)] transition-colors hover:bg-[var(--bg-active)]"
        >
          <Plus size={13} aria-hidden="true" />
          {t('project.newSession')}
        </button>
      </div>

      {project && (
        <section aria-label={t('project.details')} className="space-y-2 rounded-xl border border-[var(--border)] p-3">
          <label className="block text-[11px] font-semibold text-[var(--text-subtle)]">
            {t('project.name')}
            <input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-2.5 py-2 text-sm font-normal text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--accent)]/40" />
          </label>
          <label className="block text-[11px] font-semibold text-[var(--text-subtle)]">
            {t('project.description')}
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} className="mt-1 w-full resize-none rounded-lg border border-[var(--border)] bg-transparent px-2.5 py-2 text-sm font-normal text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--accent)]/40" />
          </label>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" disabled={!name.trim()} onClick={() => void onUpdate({ name: name.trim(), description: description.trim() })} className="rounded-lg bg-[var(--bg-hover)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--bg-active)] disabled:opacity-40">
              {t('project.save')}
            </button>
            <button type="button" onClick={() => void onUpdate({ pinned: !project.pinned })} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">
              <Pin size={13} /> {project.pinned ? t('project.unpin') : t('project.pin')}
            </button>
            <button type="button" onClick={onArchive} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-2.5 py-1.5 text-xs text-red-500 hover:bg-red-500/10">
              <Archive size={13} /> {t('project.archive')}
            </button>
          </div>
        </section>
      )}

      <div className="flex items-center gap-2">
        <p title={root} className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--text-subtle)]">
          {root}
        </p>
        <button
          type="button"
          onClick={copyPath}
          aria-label={t('project.copyPath')}
          title={t('project.copyPath')}
          className="rounded-md p-1 text-[var(--text-subtle)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
        >
          <Copy size={13} />
        </button>
      </div>

      <section aria-label="Git" className="rounded-xl border border-[var(--border)] px-3 py-2.5">
        {statusError !== null && (
          <p className="text-xs text-amber-500">{statusError}</p>
        )}
        {statusError === null && git === null && (
          <p className="text-xs text-[var(--text-subtle)]">…</p>
        )}
        {git && !git.available && statusError === null && (
          <p className="text-xs text-[var(--text-subtle)]">
            {git.error?.message ?? t('workspace.noGit')}
          </p>
        )}
        {git?.available && (
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-[var(--text)]">
            <span title={git.head ?? ''} className="font-mono font-semibold">
              {git.detached ? `detached · ${git.head?.slice(0, 8) ?? '—'}` : (git.branch ?? '—')}
            </span>
            {git.dirty ? (
              <span className="text-amber-500">
                {t('workspace.dirty')} · {git.files.length}
              </span>
            ) : (
              <span className="text-emerald-500">{t('workspace.clean')}</span>
            )}
            {(git.ahead ?? 0) > 0 && <span className="text-[var(--text-subtle)]">↑{git.ahead}</span>}
            {(git.behind ?? 0) > 0 && <span className="text-[var(--text-subtle)]">↓{git.behind}</span>}
          </p>
        )}
      </section>

      <section aria-label={t('project.sessions')}>
        <p className="mb-1.5 px-1 text-[11px] font-semibold tracking-widest text-[var(--text-subtle)] uppercase">
          {t('project.sessions')} · {sessions.length}
        </p>
        {sessions.length === 0 && (
          <p className="px-1 text-xs text-[var(--text-subtle)]">{t('project.noSessions')}</p>
        )}
        <ul className="space-y-1">
          {sessions.map((session) => (
            <li key={session.id}>
              <button
                type="button"
                onClick={() => onSelectSession(session.id)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                  session.id === activeId
                    ? 'bg-[var(--bg-hover)]'
                    : 'hover:bg-[var(--bg-hover)]/60'
                }`}
              >
                <MessageSquare size={14} aria-hidden="true" className="shrink-0 text-[var(--text-subtle)]" />
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--text)]">
                  {session.title || t('sidebar.newChat')}
                </span>
                <span className="shrink-0 rounded-md border border-[var(--border)] px-1 py-px font-mono text-[9px] tracking-wide text-[var(--text-subtle)]">
                  {session.mode.toUpperCase()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {intel && (
        <section aria-label={t('project.intelligence')} className="pb-8">
          <p className="mb-1.5 px-1 text-[11px] font-semibold tracking-widest text-[var(--text-subtle)] uppercase">
            {t('project.intelligence')}
          </p>
          <div className="space-y-2 rounded-xl border border-[var(--border)] px-3 py-2.5 text-xs text-[var(--text-muted)]">
            {intel.repository.languages.length > 0 && (
              <p>{intel.repository.languages.join(' · ')}</p>
            )}
            {intel.repository.frameworks.length > 0 && (
              <p className="text-[var(--text-subtle)]">{intel.repository.frameworks.join(' · ')}</p>
            )}
            {commands.length > 0 && (
              <div>
                <p className="mb-1 font-semibold text-[var(--text-subtle)]">{t('project.commands')}</p>
                <ul className="space-y-0.5 font-mono text-[11px]">
                  {commands.map((cmd) => (
                    <li key={cmd} className="truncate" title={cmd}>{cmd}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="flex items-center gap-2">
              <span className="font-semibold text-[var(--text-subtle)]">{t('project.instructions')}</span>
              {intel.instructions.trusted ? (
                <span>{intel.instructions.scopes.length}</span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="text-amber-500">{t('project.untrusted')}</span>
                  <button
                    type="button"
                    onClick={onTrust}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-amber-500/30 px-1.5 py-0.5 font-semibold text-amber-500 transition-colors hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
                  >
                    <ShieldCheck size={12} aria-hidden="true" />
                    {t('project.trust')}
                  </button>
                </span>
              )}
            </p>
          </div>
        </section>
      )}
    </div>
  )
}

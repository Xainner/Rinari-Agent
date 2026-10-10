import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ArrowUp, Check, CircleAlert, Folder, FolderPlus, LoaderCircle, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n, type I18nKey } from '../../i18n'
import { cn } from '../../lib/utils'
import { platform } from '../../platform'
import { commandMessage, engineApi, type ProjectSummary, type SessionSummary } from '../../services/engine'
import type { ProjectFolderCheck } from '../../types/protocol.generated'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { useProfileName } from '../../components/app-shell/SidebarIdentity'
import { useProfileStore } from '../profiles/profileStore'
import { branchLabel } from './ProjectBranch'
import { useCreateProjectStore } from './createProjectStore'
import { useProjectExpansionStore } from '../../stores/projectExpansion'

interface Row {
  path: string
  trust: boolean
}

const ERROR_KEYS: Record<string, I18nKey> = {
  NOT_FOUND: 'createProject.error.notFound',
  NOT_DIRECTORY: 'createProject.error.notDirectory',
  HOME: 'createProject.error.home',
  ENGINE_HOME: 'createProject.error.engineHome',
  DUPLICATE: 'createProject.error.duplicate',
  NESTED: 'createProject.error.nested',
  IN_PROJECT: 'createProject.error.inProject',
  TOO_MANY: 'createProject.error.tooMany',
}

const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path

/**
 * The project creation window: name, description, working folders (the first
 * is the primary), trust for each folder and the profile it belongs to, all
 * in one place, with a review before creating. Folders are checked as they
 * are added (the Engine validates; nothing is created until «Crear»).
 */
export function CreateProjectDialog({ onCreated }: { onCreated: (project: ProjectSummary, session: SessionSummary | null) => void }) {
  const { t } = useI18n()
  const open = useCreateProjectStore((state) => state.open)
  const initialPaths = useCreateProjectStore((state) => state.paths)
  const close = useCreateProjectStore((state) => state.close)
  const profiles = useProfileStore((state) => state.profiles)
  const activeId = useProfileStore((state) => state.activeId)
  const activate = useProfileStore((state) => state.activate)
  const nameOf = useProfileName()
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [description, setDescription] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [checks, setChecks] = useState<ProjectFolderCheck[]>([])
  const [checking, setChecking] = useState(false)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const nameId = useId()
  const descriptionId = useId()
  const profileFieldId = useId()
  const sequence = useRef(0)

  useEffect(() => {
    if (!open) return
    setName('')
    setNameTouched(false)
    setDescription('')
    setRows(initialPaths.map((path) => ({ path, trust: false })))
    setChecks([])
    setProfileId(activeId)
  }, [open, initialPaths, activeId])

  // The Engine checks the whole list each time it changes.
  useEffect(() => {
    if (!open) return
    if (rows.length === 0) {
      setChecks([])
      return
    }
    const run = ++sequence.current
    setChecking(true)
    engineApi.projectFoldersValidate(rows.map((row) => row.path))
      .then((result) => { if (run === sequence.current) setChecks(result.folders) })
      .catch(() => { if (run === sequence.current) setChecks([]) })
      .finally(() => { if (run === sequence.current) setChecking(false) })
  }, [open, rows])

  useEffect(() => {
    if (!nameTouched && rows[0]) setName(baseName(rows[0].path))
  }, [rows, nameTouched])

  const allValid = rows.length > 0 && checks.length === rows.length && checks.every((check) => check.ok)
  const canCreate = name.trim().length > 0 && allValid && !checking && !creating
  const trusted = rows.filter((row) => row.trust).length
  const targetProfile = profiles.find((profile) => profile.id === (profileId ?? activeId)) ?? null
  const summary = useMemo(() => t('createProject.summary', {
    name: name.trim() || t('createProject.unnamed'),
    profile: targetProfile ? nameOf(targetProfile) : '',
    folders: rows.length,
    trusted,
  }), [t, name, targetProfile, nameOf, rows.length, trusted])

  async function addFolders() {
    const picked = await platform().dialog.openFiles({ directory: true, multiple: true, title: t('createProject.pick') })
    if (!picked?.length) return
    setRows((current) => [...current, ...picked.filter((path) => !current.some((row) => row.path === path)).map((path) => ({ path, trust: false }))])
  }

  function makePrimary(index: number) {
    setRows((current) => [current[index], ...current.filter((_, i) => i !== index)])
  }

  async function create() {
    if (!canCreate) return
    setCreating(true)
    try {
      const target = profileId ?? activeId
      const result = await engineApi.projectCreate({
        name: name.trim(),
        description: description.trim() || undefined,
        folders: rows.map((row) => ({ path: row.path, trust: row.trust })),
        rinariProfileId: target,
      })
      if (target && target !== activeId) await activate(target)
      // Like every other creation surface: the new project shows in the sidebar, open and unfiltered.
      useProjectExpansionStore.getState().reveal(result.project.id)
      toast.success(t('createProject.created', { name: result.project.name }))
      close()
      onCreated(result.project, result.session)
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !creating) close() }}>
      <DialogContent className="create-project max-w-2xl" data-testid="create-project">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="create-project-badge" aria-hidden="true"><FolderPlus size={18} /></span>
            <div className="min-w-0">
              <DialogTitle>{t('createProject.title')}</DialogTitle>
              <DialogDescription>{t('createProject.subtitle')}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="create-project-grid">
          <label className="field-label" htmlFor={nameId}>{t('createProject.name')}</label>
          <input id={nameId} className="field-input" value={name} maxLength={120} placeholder={t('createProject.namePlaceholder')} onChange={(event) => { setName(event.target.value); setNameTouched(true) }} aria-required="true" />
          <label className="field-label" htmlFor={descriptionId}>{t('createProject.description')} <span className="field-hint">{t('createProject.optional')}</span></label>
          <textarea id={descriptionId} className="field-input min-h-16 resize-y" value={description} maxLength={500} placeholder={t('createProject.descriptionPlaceholder')} onChange={(event) => setDescription(event.target.value)} />
          {profiles.length > 1 && (
            <>
              <label className="field-label" htmlFor={profileFieldId}>{t('createProject.profile')}</label>
              <select id={profileFieldId} className="field-input" value={profileId ?? activeId ?? ''} onChange={(event) => setProfileId(event.target.value)}>
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{nameOf(profile)}</option>)}
              </select>
            </>
          )}
        </div>

        <section className="create-project-folders" aria-label={t('createProject.folders')}>
          <div className="create-project-folders-head">
            <span className="field-label">{t('createProject.folders')}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void addFolders()} data-testid="create-project-add">
              <FolderPlus size={13} aria-hidden="true" /> {t('createProject.addFolder')}
            </button>
          </div>
          {rows.length === 0 && <p className="create-project-empty">{t('createProject.noFolders')}</p>}
          <ul className="create-project-rows">
            {rows.map((row, index) => {
              const check = checks[index]
              const error = check && !check.ok ? check.error : null
              const branch = branchLabel(check?.git_head ?? null)
              return (
                <li key={row.path} className={cn('create-project-row', error && 'is-invalid')} data-testid="create-project-row">
                  <span className="create-project-state" aria-hidden="true">
                    {!check ? <LoaderCircle size={14} className="motion-safe:animate-spin" /> : error ? <CircleAlert size={14} /> : <Check size={14} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <Folder size={13} aria-hidden="true" className="shrink-0 text-[var(--text-subtle)]" />
                      <span className="truncate text-[13px] font-medium text-[var(--text)]">{baseName(row.path)}</span>
                      {index === 0 && <span className="create-project-primary">{t('createProject.primary')}</span>}
                      {branch && <span className="project-branch">{branch}</span>}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-[var(--text-subtle)]" title={row.path}>{row.path}</span>
                    {error && (
                      <span className="create-project-error" role="alert">
                        {t(ERROR_KEYS[error.code] ?? 'createProject.error.notFound', { project: error.project_name ?? '' })}
                      </span>
                    )}
                  </span>
                  <label className="create-project-trust">
                    <input type="checkbox" checked={row.trust} onChange={(event) => setRows((current) => current.map((item, i) => (i === index ? { ...item, trust: event.target.checked } : item)))} />
                    {t('createProject.trust')}
                  </label>
                  {index > 0 && (
                    <button type="button" className="create-project-icon" onClick={() => makePrimary(index)} aria-label={t('createProject.makePrimary')} title={t('createProject.makePrimary')}>
                      <ArrowUp size={13} aria-hidden="true" />
                    </button>
                  )}
                  <button type="button" className="create-project-icon" onClick={() => setRows((current) => current.filter((_, i) => i !== index))} aria-label={t('createProject.remove')} title={t('createProject.remove')}>
                    <X size={13} aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
          {rows.length > 1 && (
            <button type="button" className="create-project-trust-all" onClick={() => setRows((current) => current.map((row) => ({ ...row, trust: true })))}>
              <ShieldCheck size={13} aria-hidden="true" /> {t('createProject.trustAll')}
            </button>
          )}
          <p className="create-project-trust-note">
            <ShieldCheck size={13} aria-hidden="true" /> {t('createProject.trustExplain')}
          </p>
        </section>

        <p className="create-project-summary" aria-live="polite" data-testid="create-project-summary">{summary}</p>
        <DialogFooter>
          <button type="button" className="btn btn-secondary" disabled={creating} onClick={close}>{t('common.cancel')}</button>
          <button type="button" className="btn btn-primary" disabled={!canCreate} onClick={() => void create()} data-testid="create-project-submit">
            {creating ? <LoaderCircle size={14} className="motion-safe:animate-spin" aria-hidden="true" /> : <FolderPlus size={14} aria-hidden="true" />} {t('createProject.create')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

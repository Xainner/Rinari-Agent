import { useState, type ReactNode } from 'react'
import { FolderInput, FolderOutput, Layers } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { commandMessage, engineApi, type ProjectPolicy, type ProjectSummary, type SessionSummary } from '../../services/engine'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog'
import { useProfileName } from '../../components/app-shell/SidebarIdentity'
import { useProfileStore } from './profileStore'

interface PendingMove {
  session: SessionSummary
  profileId: string
  project: ProjectSummary | null
}

/**
 * Moving work between Rinari profiles. A loose conversation moves as is; a
 * project moves with all its conversations; a conversation inside a project
 * asks first, because it either leaves the project or takes the whole project
 * along. Each move ends with a toast that can switch to where it went.
 */
export function useProfileMoves(projects: ProjectSummary[]): {
  moveSession: (session: SessionSummary, profileId: string) => void
  moveProject: (project: ProjectSummary, profileId: string) => void
  dialog: ReactNode
} {
  const { t } = useI18n()
  const nameOf = useProfileName()
  const profiles = useProfileStore((state) => state.profiles)
  const activate = useProfileStore((state) => state.activate)
  const touch = useProfileStore((state) => state.touch)
  const [pending, setPending] = useState<PendingMove | null>(null)
  const [busy, setBusy] = useState(false)

  const profileName = (id: string) => {
    const profile = profiles.find((item) => item.id === id)
    return profile ? nameOf(profile) : id
  }

  function announce(message: string, profileId: string) {
    touch()
    toast.success(message, {
      action: { label: t('profiles.view', { name: profileName(profileId) }), onClick: () => void activate(profileId).catch(() => {}) },
    })
  }

  async function moveLoose(session: SessionSummary, profileId: string, policy?: ProjectPolicy) {
    setBusy(true)
    try {
      await engineApi.sessionMoveProfile(session.id, profileId, policy)
      const key = policy === 'move_project' ? 'profiles.movedProject' : 'profiles.moved'
      announce(t(key, { name: profileName(profileId) }), profileId)
      setPending(null)
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setBusy(false)
    }
  }

  function moveSession(session: SessionSummary, profileId: string) {
    if (session.project_id) {
      setPending({ session, profileId, project: projects.find((project) => project.id === session.project_id) ?? null })
      return
    }
    void moveLoose(session, profileId)
  }

  function moveProject(project: ProjectSummary, profileId: string) {
    void engineApi.projectMoveProfile(project.id, profileId)
      .then((result) => announce(t('profiles.movedProjectCount', { name: profileName(profileId), n: result.session_ids.length }), profileId))
      .catch((error) => toast.error(commandMessage(error)))
  }

  const projectName = pending?.project?.name ?? ''
  const dialog = (
    <AlertDialog open={pending !== null} onOpenChange={(open) => { if (!open && !busy) setPending(null) }}>
      <AlertDialogContent className="max-w-md" data-testid="profile-move-dialog">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <span className="profile-move-badge" aria-hidden="true"><Layers size={17} /></span>
            <AlertDialogTitle>{t('profiles.moveDialog.title', { name: pending ? profileName(pending.profileId) : '' })}</AlertDialogTitle>
          </div>
          <AlertDialogDescription>{t('profiles.moveDialog.body', { project: projectName })}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="profile-move-options">
          <button type="button" className="profile-move-option" disabled={busy} onClick={() => pending && void moveLoose(pending.session, pending.profileId, 'leave_project')}>
            <FolderOutput size={16} aria-hidden="true" />
            <span><span className="profile-move-option-title">{t('profiles.moveDialog.leave')}</span><span className="profile-move-option-body">{t('profiles.moveDialog.leaveBody', { project: projectName })}</span></span>
          </button>
          <button type="button" className="profile-move-option" disabled={busy} onClick={() => pending && void moveLoose(pending.session, pending.profileId, 'move_project')}>
            <FolderInput size={16} aria-hidden="true" />
            <span><span className="profile-move-option-title">{t('profiles.moveDialog.whole')}</span><span className="profile-move-option-body">{t('profiles.moveDialog.wholeBody', { project: projectName })}</span></span>
          </button>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t('common.cancel')}</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
  return { moveSession, moveProject, dialog }
}

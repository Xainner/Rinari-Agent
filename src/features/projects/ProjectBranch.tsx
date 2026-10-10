import { GitBranch } from 'lucide-react'
import type { GitHead } from '../../types/protocol.generated'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'

/** What to show for a project's HEAD: the branch, a short SHA when detached, or nothing. */
export function branchLabel(head: GitHead | null | undefined): string | null {
  if (!head) return null
  if (head.branch) return head.branch
  if (head.detached && head.sha_short) return head.sha_short
  return null
}

/**
 * The project's current branch, after its name. Subtle and in mono so the
 * name stays the first thing read; it shrinks before the name does. Nothing
 * at all when the folder is not a repository (no empty label, no icon).
 */
export function ProjectBranch({ head, className }: { head: GitHead | null | undefined; className?: string }) {
  const { t } = useI18n()
  const label = branchLabel(head)
  if (!label) return null
  const title = head?.operation === 'rebase'
    ? t('project.branchRebasing', { branch: label })
    : head?.branch ? t('project.branchTitle', { branch: label }) : t('project.branchDetached', { sha: label })
  return (
    <span className={cn('project-branch', className)} title={title} data-testid="project-branch">
      <GitBranch size={10} aria-hidden="true" />
      <span className="project-branch-name">{label}</span>
      {head?.operation === 'rebase' && <span className="project-branch-op">{t('project.branchRebaseShort')}</span>}
    </span>
  )
}

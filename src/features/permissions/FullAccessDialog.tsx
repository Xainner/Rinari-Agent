import { FolderOpen, Globe, ShieldAlert, ShieldCheck, SquareTerminal, TriangleAlert } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useI18n, type I18nKey } from '../../i18n'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog'

const GROUPS: ReadonlyArray<{ icon: typeof FolderOpen; title: I18nKey; body: I18nKey }> = [
  { icon: FolderOpen, title: 'perm.full.files', body: 'perm.full.filesBody' },
  { icon: SquareTerminal, title: 'perm.full.terminal', body: 'perm.full.terminalBody' },
  { icon: Globe, title: 'perm.full.internet', body: 'perm.full.internetBody' },
]

interface FullAccessDialogProps {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
}

/**
 * Antes de dar «Acceso completo» a una conversación: qué permite de verdad
 * (lo que dice `policy/engine.py` del perfil full-access), qué sigue
 * preguntando, el riesgo y cómo quitarlo. Solo se activa al confirmar;
 * cerrar o cancelar deja el perfil como estaba.
 */
export function FullAccessDialog({ open, onCancel, onConfirm }: FullAccessDialogProps) {
  const { t } = useI18n()
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) onCancel() }}>
      <AlertDialogContent className="full-access-dialog max-w-lg" data-testid="full-access-dialog">
        <AlertDialogHeader className="gap-2">
          <div className="flex items-center gap-3">
            <span className="full-access-badge" aria-hidden="true"><ShieldAlert size={18} /></span>
            <AlertDialogTitle>{t('perm.full.title')}</AlertDialogTitle>
          </div>
          <AlertDialogDescription>{t('perm.full.intro')}</AlertDialogDescription>
        </AlertDialogHeader>
        <p className="full-access-heading" aria-hidden="true">{t('perm.full.groupsLabel')}</p>
        <ul className="full-access-groups" aria-label={t('perm.full.groupsLabel')}>
          {GROUPS.map(({ icon: Icon, title, body }, index) => (
            <li key={title} className="full-access-group" style={{ '--i': index } as CSSProperties}>
              <span className="full-access-group-icon" aria-hidden="true"><Icon size={16} /></span>
              <span className="min-w-0">
                <span className="full-access-group-title">{t(title)}</span>
                <span className="full-access-group-body">{t(body)}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="full-access-still">
          <span className="full-access-still-icon" aria-hidden="true"><ShieldCheck size={15} /></span>
          <p>{t('perm.full.stillAsks')}</p>
        </div>
        <p className="full-access-risk"><TriangleAlert size={13} aria-hidden="true" /><span>{t('perm.full.risk')}</span></p>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('perm.full.cancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            <ShieldAlert size={14} aria-hidden="true" /> {t('perm.full.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

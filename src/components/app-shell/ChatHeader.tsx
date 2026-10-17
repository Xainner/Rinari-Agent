import { TitleSwap } from '../TitleSwap'
import { ArrowLeft, Eye, ShieldAlert, ShieldCheck } from 'lucide-react'
import { ResumeChip } from '../../features/resume/ResumeChip'
import { useI18n } from '../../i18n'

interface ChatHeaderProps {
  /** null = sin sesión activa. */
  title: string | null
  /** La conversación del título: un cambio a otra no se anima; también da el «Reanuda 17:40» (#24). */
  sessionId?: string | null
  /**
   * La conversación madre de una hija (#40): «← Madre · Encargo» vuelve a
   * ella con un clic. `brief` es el título del encargo.
   */
  mother?: { id: string; title: string; brief?: string | null; onOpen: (id: string) => void } | null
  /**
   * El modo de permisos en vigor de la conversación (permisos v4, P-4): un
   * distintivo siempre a la vista; en Acceso completo, en ámbar.
   */
  permission?: 'read-only' | 'workspace' | 'full-access' | null
}

const PERMISSION = {
  'read-only': { label: 'perm.readOnly', hint: 'perm.readOnlyHint', Icon: Eye },
  workspace: { label: 'perm.workspace', hint: 'perm.workspaceHint', Icon: ShieldCheck },
  'full-access': { label: 'perm.fullAccess', hint: 'perm.fullAccessHint', Icon: ShieldAlert },
} as const

/**
 * La barra de título de una conversación solo lleva su título (plan 0.4.0
 * #83): el proyecto se ve en la barra lateral y en Resumen → Entorno, la rama
 * también en Resumen, y el modo en el composer. Un título largo se recorta con
 * «…» y el completo sale al pasar el ratón. Se monta dentro de `AppStatusBar`;
 * no es un segundo header global.
 */
export default function ChatHeader({ title, sessionId = null, mother = null, permission = null }: ChatHeaderProps) {
  const { t } = useI18n()
  if (!title) return null
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2" title={title}>
      {mother && (
        <button
          type="button"
          className="chat-header-mother"
          data-testid="chat-header-mother"
          title={t('sidebar.backToMother', { title: mother.title })}
          onClick={() => mother.onOpen(mother.id)}
        >
          <ArrowLeft size={13} aria-hidden="true" />
          <span className="truncate">{mother.title}</span>
          {mother.brief && <span className="chat-header-brief truncate">· {mother.brief}</span>}
        </button>
      )}
      <TitleSwap
        as="p"
        sessionId={sessionId}
        text={title}
        className="min-w-0 truncate text-sm font-semibold text-[var(--text)]"
      />
      <ResumeChip sessionId={sessionId} />
      {permission && <PermissionBadge mode={permission} />}
      <span className="flex-1" />
    </div>
  )
}

/** El modo de permisos, siempre visible junto al título (P-4); el detalle, al pasar el ratón. */
function PermissionBadge({ mode }: { mode: NonNullable<ChatHeaderProps['permission']> }) {
  const { t } = useI18n()
  const { label, hint, Icon } = PERMISSION[mode]
  return (
    <span className="chat-header-permission" data-mode={mode} data-testid="chat-header-permission" title={t(hint)} role="status" aria-label={`${t('perm.title')}: ${t(label)}`}>
      <Icon size={12} aria-hidden="true" />
      <span>{t(label)}</span>
    </span>
  )
}

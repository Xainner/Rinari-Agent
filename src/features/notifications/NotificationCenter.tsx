import { BellRing, CalendarClock, CheckCheck, Library, TriangleAlert, X } from 'lucide-react'
import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover'
import { useI18n, type I18nKey } from '../../i18n'
import { cn } from '../../lib/utils'
import {
  NOTIFICATION_MODULES,
  selectUnreadCount,
  useNotificationCenter,
  type CenterNotification,
  type NotificationModule,
  type NotificationTarget,
} from '../../stores/notificationCenter'
import BoardAttentionSection, { useBoardAttentionTotal } from '../board/BoardAttentionSection'

const MODULE_TITLE: Record<NotificationModule, I18nKey> = {
  schedules: 'notifications.module.schedules',
  skills: 'notifications.module.skills',
  system: 'notifications.module.system',
}
const MODULE_ICON = { schedules: CalendarClock, skills: Library, system: TriangleAlert } as const
const TONE_DOT: Record<NonNullable<CenterNotification['tone']>, string> = {
  info: 'bg-[var(--accent)]',
  success: 'bg-[var(--success)]',
  warning: 'bg-[var(--warning)]',
  error: 'bg-[var(--danger)]',
}
const PER_MODULE = 8

export interface NotificationCenterProps {
  labelFor: (sessionId: string) => string
  goBoard: () => void
  onOpenTarget: (target: NotificationTarget) => void
  disabled?: boolean
}

function ago(at: number, lang: string): string {
  const minutes = Math.round((Date.now() - at) / 60_000)
  const format = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' })
  if (minutes < 60) return format.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours < 24) return format.format(-hours, 'hour')
  return format.format(-Math.round(hours / 24), 'day')
}

/**
 * La campana: un solo sitio para lo que la app avisó, por módulo. Boards se
 * deriva en vivo de los paneles; tareas programadas y skills se guardan aquí
 * cuando llegan, además del aviso emergente.
 */
export default function NotificationCenter({ labelFor, goBoard, onOpenTarget, disabled = false }: NotificationCenterProps) {
  const { t, lang } = useI18n()
  const [open, setOpen] = useState(false)
  const items = useNotificationCenter((state) => state.items)
  const unread = useNotificationCenter(selectUnreadCount)
  const markRead = useNotificationCenter((state) => state.markRead)
  const dismiss = useNotificationCenter((state) => state.dismiss)
  const boardTotal = useBoardAttentionTotal()
  const total = boardTotal + unread

  // Abrir la campana es verlas: al cerrarla, por la vía que sea, quedan leídas.
  const close = () => {
    setOpen(false)
    if (useNotificationCenter.getState().items.some((item) => !item.read)) markRead()
  }
  const go = (item: CenterNotification) => {
    close()
    if (item.target) onOpenTarget(item.target)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(value) => (value ? setOpen(true) : close())}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="app-topbar-icon app-topbar-attention"
          aria-label={t('notifications.open', { n: total })}
          title={t('notifications.open', { n: total })}
          disabled={disabled}
          data-testid="notification-center-trigger"
        >
          <BellRing size={16} aria-hidden="true" />
          {total > 0 && <span className="app-topbar-attention-badge" aria-hidden="true">{total > 99 ? '99+' : total}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[70vh] w-96 overflow-y-auto p-2" aria-label={t('notifications.title')}>
        <div className="flex items-center justify-between px-1 pb-2">
          <span className="text-sm font-semibold text-[var(--text)]">{t('notifications.title')}</span>
          {unread > 0 && (
            <button type="button" className="inline-flex items-center gap-1 text-[11px] text-[var(--accent-2)] hover:underline" onClick={() => markRead()}>
              <CheckCheck size={12} aria-hidden="true" /> {t('notifications.markAll')}
            </button>
          )}
        </div>
        {boardTotal === 0 && items.length === 0 && (
          <p className="px-1 py-3 text-center text-xs text-[var(--text-muted)]">{t('notifications.empty')}</p>
        )}
        <div className="space-y-3">
          <BoardAttentionSection labelFor={labelFor} goBoard={goBoard} onNavigate={close} />
          {NOTIFICATION_MODULES.map((module) => {
            const entries = items.filter((item) => item.module === module).slice(0, PER_MODULE)
            if (entries.length === 0) return null
            const Icon = MODULE_ICON[module]
            return (
              <section key={module} aria-label={t(MODULE_TITLE[module])} className="border-t border-[var(--border)] pt-2">
                <p className="flex items-center gap-1.5 px-1 pb-1.5 text-[11px] font-semibold tracking-wide text-[var(--text-subtle)] uppercase">
                  <Icon size={12} aria-hidden="true" /> {t(MODULE_TITLE[module])}
                </p>
                <ul className="space-y-0.5">
                  {entries.map((item) => (
                    <li key={item.id} className="group flex items-start gap-1 rounded-lg hover:bg-[var(--bg-hover)]">
                      <button type="button" onClick={() => go(item)} className="flex min-w-0 flex-1 items-start gap-2 px-2 py-1.5 text-left">
                        <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', item.read ? 'bg-transparent' : TONE_DOT[item.tone ?? 'info'])} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs text-[var(--text)]">{item.title}</span>
                          {item.body && <span className="block truncate text-[11px] text-[var(--text-muted)]">{item.body}</span>}
                          <span className="block text-[10px] text-[var(--text-subtle)]">{ago(item.at, lang)}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={t('notifications.dismiss', { title: item.title })}
                        onClick={() => dismiss(item.id)}
                        className="mt-1 mr-1 rounded p-1 text-[var(--text-subtle)] opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-[var(--text)]"
                      >
                        <X size={11} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

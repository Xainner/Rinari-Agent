import { Bell } from 'lucide-react'
import { useI18n } from '../../i18n'
import { notificationSupport } from '../../services/notifications'
import { useNotificationPrefs } from '../../stores/notificationPrefs'
import { Row, Section } from './parts'
import { Switch } from '../ui/switch'
import SoundSettings from './SoundSettings'

/**
 * Ajustes → Notificaciones (plan 0.4.0 #33, #64): dónde avisa Rinari (dentro
 * de la app y en el sistema, con o sin el contenido), de qué avisa (cuando te
 * necesita y cuando termina un plan) y sus sonidos. Valen para todas las
 * conversaciones, no solo las de Boards. Una vista previa muestra cómo se lee
 * la notificación del sistema con la privacidad elegida.
 */
export default function NotificationSettings() {
  const { t } = useI18n()
  const prefs = useNotificationPrefs()
  const set = useNotificationPrefs((state) => state.set)
  // El canal nativo puede faltar en un build: entonces no se ofrece.
  const systemSupported = notificationSupport.canSend
  const system = prefs.system && systemSupported
  const name = t('settings.notifications.previewName')

  return (
    <section className="space-y-6" data-testid="notification-settings">
      <div>
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-[var(--text)]">
          <Bell size={17} aria-hidden="true" /> {t('settings.notifications.title')}
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{t('settings.notifications.desc')}</p>
      </div>

      <Section title={t('settings.notifications.where')}>
        <Row
          title={t('settings.notifications.toasts')}
          desc={t('settings.notifications.toastsHint')}
          control={<Switch checked={prefs.toasts} onCheckedChange={(value) => set({ toasts: value })} aria-label={t('settings.notifications.toasts')} />}
        />
        <Row
          title={t('settings.notifications.system')}
          desc={systemSupported ? t('settings.notifications.systemHint') : t('settings.general.board.systemUnsupported')}
          control={<Switch checked={system} disabled={!systemSupported} onCheckedChange={(value) => set({ system: value })} aria-label={t('settings.notifications.system')} />}
        />
        <Row
          title={t('settings.notifications.showContent')}
          desc={t('settings.notifications.showContentHint')}
          control={<Switch checked={prefs.showContent} disabled={!system} onCheckedChange={(value) => set({ showContent: value })} aria-label={t('settings.notifications.showContent')} />}
        />
        {system && (
          <div className="notify-preview" data-testid="notification-preview" data-content={prefs.showContent || undefined} aria-label={t('settings.notifications.preview')}>
            <span className="notify-preview-label">{t('settings.notifications.preview')}</span>
            <div className="notify-preview-card">
              <img src="/logo.png?v=2" alt="" aria-hidden="true" className="notify-preview-icon" />
              <div className="min-w-0 flex-1">
                <p className="notify-preview-app">Rinari</p>
                {prefs.showContent ? (
                  <>
                    <p className="notify-preview-title">{name}</p>
                    <p className="notify-preview-body">{t('settings.notifications.previewBody')}</p>
                  </>
                ) : (
                  <p className="notify-preview-title">{t('notify.private.done', { name })}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </Section>

      <Section title={t('settings.notifications.what')}>
        <Row
          title={t('settings.notifications.needsYou')}
          desc={t('settings.notifications.needsYouHint')}
          control={<Switch checked={prefs.needsYou} onCheckedChange={(value) => set({ needsYou: value })} aria-label={t('settings.notifications.needsYou')} />}
        />
        <Row
          title={t('settings.notifications.planReady')}
          desc={t('settings.notifications.planReadyHint')}
          control={<Switch checked={prefs.planReady} onCheckedChange={(value) => set({ planReady: value })} aria-label={t('settings.notifications.planReady')} />}
        />
      </Section>

      <SoundSettings />
    </section>
  )
}

import type { Language } from '../../types'
import { useI18n } from '../../i18n'
import { useUIStore } from '../../stores/ui'
import { useBoardStore } from '../../stores/board'
import { inputClass, Row, Section } from './parts'
import { Switch } from '../ui/switch'
import { notificationSupport } from '../../services/notifications'
import BackgroundSettings from './BackgroundSettings'

/** Settings > General (§19): idioma + comportamiento. Guardado inmediato. */
export default function GeneralSettings({
  language,
  onLanguageChange,
}: {
  language: Language
  onLanguageChange: (lang: Language) => void
}) {
  const { t } = useI18n()
  const enterToSend = useUIStore((s) => s.enterToSend)
  const setEnterToSend = useUIStore((s) => s.setEnterToSend)
  const autoFollow = useUIStore((s) => s.autoFollow)
  const setAutoFollow = useUIStore((s) => s.setAutoFollow)
  const showSuggestions = useUIStore((s) => s.showSuggestions)
  const setShowSuggestions = useUIStore((s) => s.setShowSuggestions)
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
  const setSidebarCollapsed = useUIStore((s) => s.setSidebarCollapsed)
  const softLimit = useBoardStore((s) => s.softLimit)
  const setSoftLimit = useBoardStore((s) => s.setSoftLimit)
  const messagingEnabled = useBoardStore((s) => s.messagingEnabled)
  const setMessagingEnabled = useBoardStore((s) => s.setMessagingEnabled)
  const notifications = useBoardStore((s) => s.notifications)
  const setNotifications = useBoardStore((s) => s.setNotifications)
  // El canal nativo requiere el plugin oficial (PR aparte): este build no lo incluye.
  const systemSupported = notificationSupport.canSend

  return (
    <div className="space-y-6">
      <Section title={t('settings.language')}>
        <div className="max-w-xs">
          <select
            aria-label={t('settings.language')}
            value={language}
            onChange={(e) => onLanguageChange(e.target.value as Language)}
            className={inputClass}
          >
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </div>
      </Section>

      <Section title={t('settings.general.chat')}>
        <Row
          title={t('settings.general.enterToSend')}
          desc={t('settings.general.enterToSendDesc')}
          control={
            <Switch
              checked={enterToSend}
              onCheckedChange={setEnterToSend}
              aria-label={t('settings.general.enterToSend')}
            />
          }
        />
        <Row
          title={t('settings.general.autoFollow')}
          desc={t('settings.general.autoFollowDesc')}
          control={
            <Switch
              checked={autoFollow}
              onCheckedChange={setAutoFollow}
              aria-label={t('settings.general.autoFollow')}
            />
          }
        />
        <Row
          title={t('settings.general.suggestions')}
          desc={t('settings.general.suggestionsDesc')}
          control={
            <Switch
              checked={showSuggestions}
              onCheckedChange={setShowSuggestions}
              aria-label={t('settings.general.suggestions')}
            />
          }
        />
      </Section>

      <BackgroundSettings />

      <Section title={t('settings.general.sidebar')}>
        <Row
          title={t('settings.general.rememberSidebar')}
          desc={t('settings.general.rememberSidebarDesc')}
          control={
            <Switch
              checked={sidebarCollapsed}
              onCheckedChange={setSidebarCollapsed}
              aria-label={t('settings.general.rememberSidebar')}
            />
          }
        />
      </Section>

      <Section title={t('settings.general.board.title')}>
        <Row
          title={t('settings.general.board.softLimit')}
          desc={t('settings.general.board.softLimitHint')}
          control={
            <input
              type="number"
              min={0}
              max={100}
              value={softLimit}
              onChange={(event) => setSoftLimit(Number(event.target.value))}
              aria-label={t('settings.general.board.softLimit')}
              className={`${inputClass} w-24`}
            />
          }
        />
        <Row
          title={t('board.peers.boardToggle')}
          desc={t('board.peers.boardToggleHint')}
          control={
            <Switch
              checked={messagingEnabled}
              onCheckedChange={setMessagingEnabled}
              aria-label={t('board.peers.boardToggle')}
            />
          }
        />
      </Section>

      <Section title={t('settings.general.board.notifications')}>
        <Row
          title={t('settings.general.board.toasts')}
          desc={t('settings.general.board.toastsHint')}
          control={<Switch checked={notifications.toasts} onCheckedChange={(value) => setNotifications({ toasts: value })} aria-label={t('settings.general.board.toasts')} />}
        />
        <Row
          title={t('settings.general.board.needsYou')}
          desc={t('settings.general.board.needsYouHint')}
          control={<Switch checked={notifications.needsYou} onCheckedChange={(value) => setNotifications({ needsYou: value })} aria-label={t('settings.general.board.needsYou')} />}
        />
        <Row
          title={t('settings.general.board.system')}
          desc={systemSupported ? t('settings.general.board.systemHint') : t('settings.general.board.systemUnsupported')}
          control={<Switch checked={notifications.system && systemSupported} disabled={!systemSupported} onCheckedChange={(value) => setNotifications({ system: value })} aria-label={t('settings.general.board.system')} />}
        />
        <Row
          title={t('settings.general.board.systemDetails')}
          desc={t('settings.general.board.systemDetailsHint')}
          control={<Switch checked={notifications.systemDetails} disabled={!systemSupported} onCheckedChange={(value) => setNotifications({ systemDetails: value })} aria-label={t('settings.general.board.systemDetails')} />}
        />
      </Section>
    </div>
  )
}

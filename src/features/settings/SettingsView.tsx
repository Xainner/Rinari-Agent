import VisionSettings from '../../components/settings/VisionSettings'
import ContextSettings from '../../components/settings/ContextSettings'
import { useI18n } from '../../i18n'
import { useUIStore } from '../../stores/ui'
import type { ModelSummary, ProviderSummary } from '../../services/engine'
import SettingsShell from '../../components/settings/SettingsShell'
import GeneralSettings from '../../components/settings/GeneralSettings'
import AppearanceSettings from '../../components/settings/AppearanceSettings'
import AboutSettings from '../../components/settings/AboutSettings'
import SoonSettings from '../../components/settings/SoonSettings'
import ProvidersView from '../providers/ProvidersView'
import ModelsView from '../providers/ModelsView'
import AgentsView from '../agents/AgentsView'
import SoulsView from '../souls/SoulsView'
import McpView from '../ecosystem/McpView'
import PluginsView from '../ecosystem/PluginsView'
import ToolsView from '../ecosystem/ToolsView'
import TerminalView from '../ecosystem/TerminalView'
import ProfilesView from '../ecosystem/ProfilesView'
import AdvancedSettings from '../../components/settings/AdvancedSettings'
import ShortcutsSettings from '../../components/settings/ShortcutsSettings'

/** Vista de ajustes: shell + sección activa. Terminal llega en Fase 10. */
export default function SettingsView({
  appVersion,
  providers,
  models,
  activeSessionId,
  onCatalogChanged,
}: {
  appVersion: string
  providers: ProviderSummary[]
  models: ModelSummary[]
  activeSessionId: string | null
  onCatalogChanged: () => void
}) {
  const { lang } = useI18n()
  const section = useUIStore((s) => s.settingsSection)
  const goChat = useUIStore((s) => s.goChat)
  const setLang = useUIStore((s) => s.setLang)
  const setSection = useUIStore((s) => s.setSettingsSection)

  return (
    <SettingsShell onBack={goChat}>
      {section === 'general' && (
        <GeneralSettings language={lang} onLanguageChange={(next) => setLang(next)} />
      )}
      {section === 'shortcuts' && <ShortcutsSettings />}
      {section === 'appearance' && <AppearanceSettings />}
      {section === 'providers' && (
        <ProvidersView providers={providers} onChanged={onCatalogChanged} />
      )}
      {section === 'vision' && <VisionSettings models={models} providers={providers} />}
      {section === 'context' && <ContextSettings models={models} providers={providers} />}
      {section === 'models' && (
        <ModelsView
          providers={providers}
          onChanged={onCatalogChanged}
          onAddProvider={() => setSection('providers')}
        />
      )}
      {section === 'agents' && (
        <AgentsView
          models={models}
          activeSessionId={activeSessionId}
          onChanged={onCatalogChanged}
        />
      )}
      {section === 'soul' && <SoulsView onChanged={onCatalogChanged} />}
      {section === 'mcp' && <McpView onChanged={onCatalogChanged} />}
      {section === 'plugins' && <PluginsView onChanged={onCatalogChanged} />}
      {section === 'tools' && <ToolsView />}
      {section === 'profiles' && (
        <ProfilesView
          activeSessionId={activeSessionId}
          onChanged={onCatalogChanged}
        />
      )}
      {section === 'terminal' && <TerminalView />}
      {section === 'advanced' && <AdvancedSettings />}
      {section === 'about' && <AboutSettings version={appVersion} />}
      {!['context', 'vision', 'general', 'shortcuts', 'appearance', 'providers', 'models', 'agents', 'soul', 'mcp', 'plugins', 'tools', 'profiles', 'terminal', 'advanced', 'about'].includes(section) && (
        <SoonSettings />
      )}
    </SettingsShell>
  )
}

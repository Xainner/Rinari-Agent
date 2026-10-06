import type { SendOptions } from '../engine/useEngineSession'
import { useCallback, useMemo } from 'react'
import { ChevronsLeft, MessageSquarePlus, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import ChatView from '../../components/ChatView'
import { useEngineCommands, useEngineData } from '../engine/EngineContext'
import { paneDraftKey, useBoardStore, type BoardPane, type PaneDraft } from '../../stores/board'
import { selectReasoning, useSessionUiStore } from '../../stores/sessionUi'
import type { DraftPermission } from '../../stores/conversationDraft'
import type { AttachmentRef } from '../../types'
import type { ModelSummary } from '../../services/engine'
import { cn } from '../../lib/utils'

const EMPTY_SEARCH = Promise.resolve({ root: '', files: [] })

/**
 * Panel de una conversación nueva que aún no existe. Tiene composer, modo,
 * permisos y modelo, pero ninguna sesión: no consulta historial, procesos ni
 * notificaciones. Con el primer mensaje se crea la sesión (del proyecto o
 * general) y el panel pasa a ser un panel normal de esa sesión.
 */
export default function DraftPane({
  pane,
  focused,
  onFocus,
  onRemove,
  onOpenProviders,
}: {
  pane: BoardPane & { draft: PaneDraft }
  focused: boolean
  onFocus: (paneId: string) => void
  onRemove: (paneId: string) => void
  onOpenProviders: () => void
}) {
  const { t } = useI18n()
  const commands = useEngineCommands()
  const data = useEngineData()
  const updatePaneDraft = useBoardStore((state) => state.updatePaneDraft)
  const materializePane = useBoardStore((state) => state.materializePane)
  const setCollapsed = useBoardStore((state) => state.setCollapsed)
  const expandPane = useBoardStore((state) => state.expandPane)
  const key = paneDraftKey(pane.paneId)
  const reasoningEffort = useSessionUiStore(selectReasoning(key))
  const setReasoningFor = useSessionUiStore((state) => state.setReasoningFor)
  const project = useMemo(
    () => (pane.draft.projectId ? data.projects.find((item) => item.id === pane.draft.projectId) ?? null : null),
    [data.projects, pane.draft.projectId],
  )
  const activeModel = pane.draft.model ?? data.activeModel
  const title = t('sidebar.newChat')

  const send = useCallback(async (text: string, attachments: AttachmentRef[] = [], options?: SendOptions) => {
    const current = useBoardStore.getState().panes.find((item) => item.paneId === pane.paneId)
    if (!current?.draft) return false
    const sessionId = await commands.materializeDraft({ key, ...current.draft }, { activate: false })
    if (!sessionId) return false
    const ok = options
      ? await commands.sendTo(sessionId, text, attachments, options)
      : await commands.sendTo(sessionId, text, attachments)
    if (ok) materializePane(pane.paneId, sessionId)
    // El reintento reutiliza la sesión ya creada.
    else updatePaneDraft(pane.paneId, { sessionId })
    return ok
  }, [commands, key, materializePane, pane.paneId, updatePaneDraft])

  const focus = useCallback(() => {
    if (!focused) onFocus(pane.paneId)
  }, [focused, onFocus, pane.paneId])

  if (pane.collapsed) {
    return (
      <div data-pane-id={pane.paneId} data-draft className={cn('pane-strip', focused && 'is-focused')}>
        <button type="button" className="pane-strip-expand" aria-label={t('board.pane.expand')} title={title} onClick={() => expandPane(pane.paneId, { focus: true })}>
          <MessageSquarePlus size={13} aria-hidden="true" />
          <span className="pane-strip-title" aria-hidden="true">{title}</span>
        </button>
      </div>
    )
  }

  return (
    <section
      aria-label={title}
      data-pane-id={pane.paneId}
      data-draft
      data-focused={focused || undefined}
      className={cn('session-pane', focused && 'is-focused')}
      style={{ width: pane.width }}
      onPointerDownCapture={focus}
      onFocusCapture={focus}
    >
      <header className={cn('pane-header', focused && 'is-focused')} data-testid="pane-header">
        <div className="pane-header-identity">
          <span className="pane-header-title" title={title}>{title}</span>
          {project && <span className="pane-header-project" title={project.root}>{project.name}</span>}
        </div>
        <div className="pane-header-controls">
          <button type="button" aria-label={t('board.pane.collapse')} title={t('board.pane.collapse')} className="pane-header-icon" onClick={() => setCollapsed(pane.paneId, true)}>
            <ChevronsLeft size={15} />
          </button>
          <button type="button" aria-label={t('board.pane.remove')} title={t('board.pane.remove')} className="pane-header-icon" onClick={() => onRemove(pane.paneId)}>
            <X size={15} />
          </button>
        </div>
      </header>
      <div className="session-pane-body">
        <div className="session-pane-chat">
          <ChatView
            homeContext={{ projectName: project?.name ?? null, changedFiles: null }}
            homeVariant="pane"
            messages={[]}
            sessionId=""
            composerDraftKey={key}
            isStreaming={false}
            engineReady={data.ready}
            onSend={send}
            onStop={() => {}}
            onOpenProviders={onOpenProviders}
            models={data.models}
            providers={data.providers}
            activeAlias={activeModel?.alias ?? null}
            activeModel={activeModel}
            onUseModel={(model: ModelSummary) => updatePaneDraft(pane.paneId, { model })}
            onDiscoverModels={() => void commands.discoverCatalog()}
            onRefreshModels={commands.refreshModels}
            sessionMode={pane.draft.mode}
            onModeChange={(mode) => updatePaneDraft(pane.paneId, { mode })}
            reasoningEffort={reasoningEffort}
            onReasoningChange={(effort) => setReasoningFor(key, effort)}
            timelines={{}}
            onResolveApproval={() => {}}
            permissionProfile={pane.draft.permissionProfile}
            effectivePermissionProfile={pane.draft.permissionProfile}
            permissionProfilesV2={data.status?.capabilities.permission_profiles_v2 === true}
            onPermissionChange={(profile) => updatePaneDraft(pane.paneId, { permissionProfile: profile as DraftPermission })}
            onSearchFiles={() => EMPTY_SEARCH}
            historyNote={null}
            historyPhase="loaded"
            composerPrimary={false}
            composerAcceptsGlobalFocus={focused}
          />
        </div>
      </div>
    </section>
  )
}

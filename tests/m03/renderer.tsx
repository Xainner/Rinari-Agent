import { useCallback, useState } from 'react'
import { createRoot } from 'react-dom/client'
import ChatView from '../../src/components/ChatView'
import { useSessionList } from '../../src/features/engine/useSessionList'
import { I18nProvider } from '../../src/i18n'
import { engineApi } from '../../src/services/engine'
import { copyText } from '../../src/lib/clipboard'
import { useComposerStore } from '../../src/stores/composer'
import { useUIStore } from '../../src/stores/ui'
import { ProcessRuntimeProvider } from '../../src/features/processes/ProcessRuntimeProvider'
import { FileWorkspaceProvider, FileViewer, useFileWorkspace } from '../../src/features/files/FileWorkspace'
import type { ChatMessage } from '../../src/types'
import type { TimelineAction } from '../../src/features/activity/turnTimelineReducer'
import './styles.css'

const noop = () => {}
function FileHarness() {
  const controller = useFileWorkspace()
  Object.assign(window, { m03Files: controller })
  return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}><FileViewer /></div>
}
function Harness() {
  const [messages, setMessages] = useState<Record<string,ChatMessage[]>>({})
  const dispatch = useCallback((action: TimelineAction) => {
    if(action.type === 'history/loaded') setMessages(current => ({...current,[action.sessionId]:action.messages}))
  },[])
  const sessions = useSessionList({dispatch,engineReady:true,timelineEnabled:false})
  const id = sessions.activeSession
  Object.assign(window, { m03: {
    select: sessions.selectSession,
    create: sessions.createSession,
    retry: () => sessions.retrySessionHistory(id),
    status: () => ({id,phase:sessions.historyPhases[id]}),
    draft: (text: string) => useComposerStore.getState().setTextFor(id,text),
    copy: copyText,
    reducedMotion: () => useUIStore.getState().setReduceMotion(true),
  }})
  return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}>
    <header style={{height:36,flexShrink:0}}>M03 isolated integration fixture</header>
    <main style={{flex:1,minHeight:0}}>
    <ChatView sessionId={id} messages={messages[id] ?? []} timelines={{}}
      historyPhase={id ? sessions.historyPhases[id] ?? 'unloaded' : 'loaded'}
      onRetryHistory={() => void sessions.retrySessionHistory(id)}
      onSend={async text => {
        setMessages(current => ({...current,[id]:[...(current[id]??[]),{id:'optimistic',role:'user',content:text,createdAt:Date.now()}]}))
        await engineApi.startTurn(id,text)
        return true
      }}
      isStreaming={false} engineReady onStop={noop} onOpenProviders={noop}
      models={[]} providers={[]} activeAlias={null} onUseModel={noop} onDiscoverModels={noop}
      onResolveApproval={noop} historyNote={null} sessionMode="build" onModeChange={noop}
      reasoningEffort="off" onReasoningChange={noop} permissionProfile="workspace"
      effectivePermissionProfile="workspace" permissionProfilesV2 onPermissionChange={noop}
      onSearchFiles={async () => ({root:'.',files:[]})} />
    </main>
  </div>
}
await engineApi.start()
createRoot(document.getElementById('root')!).render(<I18nProvider lang="es"><ProcessRuntimeProvider epoch={1} engineReady hasCapability={false} hasIdentity={false}>{location.search.includes('files=1') ? <FileWorkspaceProvider sessionId="ses_primary"><FileHarness /></FileWorkspaceProvider> : <Harness />}</ProcessRuntimeProvider></I18nProvider>)

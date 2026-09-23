import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from '../../src/i18n'
import Composer from '../../src/components/composer/Composer'
import MessageBubble from '../../src/components/MessageBubble'
import { useComposerStore } from '../../src/stores/composer'
import { useUIStore } from '../../src/stores/ui'
import { createTestBridge } from '../../src/platform/testBridge'
import { setPlatformForTests } from '../../src/platform'
import './styles.css'
setPlatformForTests(createTestBridge())
const noop=()=>{}
const lines=['Continua','De esos 33 cuales son accesibles por internet?','Primera línea\nSegunda línea','https://example.test/'+('ruta-larga'.repeat(12))]
function Fixture(){
 const [width,setWidth]=useState(1000)
 let samples:number[]=[]
 const send=()=>document.querySelector<HTMLButtonElement>('[aria-label="Enviar mensaje"]')!.click()
 Object.assign(window,{fixture:{
 width:setWidth,
 longDraft:()=>useComposerStore.getState().setTextFor('s','Texto largo de prueba.\n'.repeat(50)),
 send,reduced:()=>useUIStore.getState().setReduceMotion(true),
 captureSend(){samples=[];const start=performance.now();send();const frame=()=>{samples.push(document.querySelector('textarea')!.getBoundingClientRect().height);if(performance.now()-start<320)requestAnimationFrame(frame)};requestAnimationFrame(frame)},
 samples:()=>samples,
 geometry:()=>[...document.querySelectorAll<HTMLElement>('[data-testid=user-message-bubble]')].map(b=>{
  const row=b.closest('[data-testid=user-message-row]')!.getBoundingClientRect(),rect=b.getBoundingClientRect(),style=getComputedStyle(b)
  const height=rect.height-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom)
  return {rightError:row.right-rect.right,width:rect.width,lines:Math.round(height/parseFloat(style.lineHeight)),overflow:b.scrollWidth>b.clientWidth+1}
 })
 }})
 return <I18nProvider lang="es"><main style={{width,maxWidth:'100%',margin:'12px auto',padding:16}}><h1>M07 · Composer y burbujas · {width}px</h1><div style={{display:'grid',gap:12,marginBottom:18}}>{lines.map((content,i)=><MessageBubble key={i} message={{id:String(i),role:'user',content,createdAt:1000}}/>)}</div>
 <Composer placement="bottom" sessionId="s" primary={false} onSend={()=>new Promise<boolean>(r=>setTimeout(()=>r(true),30))} isStreaming={false} onStop={noop} models={[]} activeAlias={null} onUseModel={noop} onDiscoverModels={noop} onOpenProviders={noop} sessionMode="build" onModeChange={noop} reasoningEffort="off" onReasoningChange={noop} permissionProfile="workspace" effectivePermissionProfile="workspace" permissionProfilesV2 onPermissionChange={noop} onSearchFiles={async()=>({root:'/',files:[]})}/></main></I18nProvider>
}
createRoot(document.getElementById('root')!).render(<Fixture/>)


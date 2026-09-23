// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { installMockPlatform } from '../../test/mockPlatform'
import { I18nProvider } from '../../i18n'
import { useComposerStore } from '../../stores/composer'
import { useUIStore } from '../../stores/ui'
import Composer from './Composer'
installMockPlatform()
afterEach(cleanup)
beforeEach(()=>{
  useComposerStore.setState({sessionKey:'draft',text:'',attachments:[],draftsBySession:{}})
  useUIStore.setState({reduceMotion:false})
})
const noop=()=>{}
const base: ComponentProps<typeof Composer>={placement:'bottom',sessionId:'s',primary:false,onSend:async()=>true,isStreaming:false,onStop:noop,models:[],activeAlias:null,onUseModel:noop,onDiscoverModels:noop,onOpenProviders:noop,sessionMode:'build',onModeChange:noop,reasoningEffort:'off',onReasoningChange:noop,permissionProfile:'workspace',effectivePermissionProfile:'workspace',permissionProfilesV2:true,onPermissionChange:noop,onSearchFiles:async()=>({root:'/',files:[]})}
function setup(extra:Partial<typeof base>={}) {
  const view=render(<I18nProvider lang="es"><Composer {...base} {...extra}/></I18nProvider>)
  const el=screen.getByRole('textbox') as HTMLTextAreaElement
  el.style.minHeight='52px'
  Object.defineProperty(el,'scrollHeight',{configurable:true,get:()=>el.value.length>100?500:52})
  el.getBoundingClientRect=()=>({height:parseFloat(el.style.height)||52,width:600} as DOMRect)
  const cancel=vi.fn()
  el.animate=vi.fn(()=>({cancel} as unknown as Animation))
  return {view,el,cancel}
}
const long='multilinea\n'.repeat(60)
it.each([false,true])('resets the committed empty textarea for normal/direct sends (direct=%s)',async direct=>{
  const send=vi.fn(()=>new Promise<boolean>(()=>{}))
  const {el}=setup(direct?{mentionTargets:[{id:'b',label:'Docs'}],onSendToTarget:send}:{onSend:send})
  fireEvent.change(el,{target:{value:(direct?'@Docs ':'')+long}})
  expect(el.style.height).toBe('240px')
  fireEvent.click(screen.getByRole('button',{name:'Enviar mensaje'}))
  expect(el.value).toBe('')
  expect(el.style.height).toBe('52px')
  expect(el.animate).toHaveBeenCalledWith([{height:'240px'},{height:'52px'}],{duration:160,easing:'ease-out'})
  expect(document.activeElement).toBe(el)
  expect(send).toHaveBeenCalledOnce()
})
it('restores rejected text and attachments, cancels shrinking and remeasures',async()=>{
  let resolve!: (value:boolean)=>void
  const {el,cancel}=setup({onSend:()=>new Promise(r=>{resolve=r})})
  act(()=>useComposerStore.getState().addAttachmentFor('s',{id:'a',path:'/a.txt',name:'a.txt',source:'native',status:'ready'}))
  fireEvent.change(el,{target:{value:long}})
  fireEvent.click(screen.getByRole('button',{name:'Enviar mensaje'}))
  await act(async()=>resolve(false))
  expect(el.value).toBe(long)
  expect(el.style.height).toBe('240px')
  expect(useComposerStore.getState().getDraft('s').attachments).toHaveLength(1)
  expect(cancel).toHaveBeenCalled()
})
it('applies reduced motion immediately and remeasures a different session without an old shrink',()=>{
  useUIStore.setState({reduceMotion:true})
  const {el,view}=setup()
  fireEvent.change(el,{target:{value:long}})
  fireEvent.click(screen.getByRole('button',{name:'Enviar mensaje'}))
  expect(el.style.height).toBe('52px')
  expect(el.animate).not.toHaveBeenCalled()
  act(()=>useComposerStore.getState().setTextFor('other',long))
  view.rerender(<I18nProvider lang="es"><Composer {...base} sessionId="other"/></I18nProvider>)
  expect(el.style.height).toBe('240px')
  expect(el.animate).not.toHaveBeenCalled()
})

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
  Object.defineProperty(el,'clientWidth',{configurable:true,get:()=>600})
  el.getBoundingClientRect=()=>({height:parseFloat(el.style.height)||52,width:600} as DOMRect)
  const cancel=vi.fn()
  el.animate=vi.fn(()=>({cancel} as unknown as Animation))
  return {view,el,cancel}
}
const long='multilinea\n'.repeat(60)
it('replaces Stop with steering only while there is text and restores it after sending or clearing', async () => {
  const onSteer = vi.fn(async () => true), onStop = vi.fn(), onSend = vi.fn()
  const { el } = setup({ isStreaming: true, onSteer, onStop, onSend })
  expect(screen.getByRole('button', { name: 'Detener generación' })).toBeTruthy()
  fireEvent.change(el, { target: { value: '  ' } })
  expect(screen.queryByRole('button', { name: 'Enviar ahora, sin detenerla' })).toBeNull()
  fireEvent.change(el, { target: { value: 'Revisa también esto' } })
  expect(screen.queryByRole('button', { name: 'Detener generación' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Enviar ahora, sin detenerla' }))
  await act(async () => {})
  expect(onSteer).toHaveBeenCalledWith('Revisa también esto')
  expect(onSend).not.toHaveBeenCalled()
  expect(onStop).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Detener generación' })).toBeTruthy()
  fireEvent.change(el, { target: { value: 'Borrador' } })
  fireEvent.change(el, { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Detener generación' }))
  expect(onStop).toHaveBeenCalledOnce()
})
it('restores the steering action and draft after a refused delivery', async () => {
  const { el } = setup({ isStreaming: true, onSteer: async () => false })
  fireEvent.change(el, { target: { value: 'Conserva este borrador' } })
  fireEvent.click(screen.getByRole('button', { name: 'Enviar ahora, sin detenerla' }))
  await act(async () => {})
  expect(el.value).toBe('Conserva este borrador')
  expect(screen.getByRole('button', { name: 'Enviar ahora, sin detenerla' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Detener generación' })).toBeNull()
})
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

it('sizes a composer mounted in a 48 px unfolding pane from its real width, up to the CSS maximum',()=>{
  // Desplegar un panel de Boards monta el composer sin ancho de contenido: ahí
  // el placeholder parte cada letra en su línea y scrollHeight sale enorme.
  // Si la ventana no pinta, el ResizeObserver tarda o no llega nunca.
  const observers:{callback:ResizeObserverCallback}[]=[]
  vi.stubGlobal('ResizeObserver',class{constructor(public callback:ResizeObserverCallback){observers.push(this)}observe(){}unobserve(){}disconnect(){}})
  const sheet=document.head.appendChild(document.createElement('style'))
  sheet.textContent='textarea{min-height:52px;max-height:160px}'
  let width=0
  const proto=HTMLTextAreaElement.prototype as unknown as Record<string,unknown>
  Object.defineProperty(proto,'clientWidth',{configurable:true,get:()=>width})
  Object.defineProperty(proto,'scrollHeight',{configurable:true,get(this:HTMLTextAreaElement){return width<100?900:this.value.length>100?500:52}})
  proto.getBoundingClientRect=function(this:HTMLTextAreaElement){return {height:parseFloat(this.style.height)||52,width} as DOMRect}
  try {
    render(<I18nProvider lang="es"><Composer {...base}/></I18nProvider>)
    const el=screen.getByRole('textbox') as HTMLTextAreaElement
    expect(el.style.height).toBe('52px')
    width=470
    act(()=>{for(const o of observers)o.callback([],o as unknown as ResizeObserver)})
    expect(el.style.height).toBe('52px')
    fireEvent.change(el,{target:{value:long}})
    expect(el.style.height).toBe('160px')
  } finally {
    delete proto.clientWidth
    delete proto.scrollHeight
    delete proto.getBoundingClientRect
    sheet.remove()
    vi.unstubAllGlobals()
  }
})

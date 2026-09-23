import { app, protocol, clipboard, BrowserWindow } from 'electron'
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { createMainWindow, focusExistingWindow } from '../../electron/main/window'
import { contentTypeFor, resolveAppUrl } from '../../electron/main/appScheme'
import { registerIpc, type HostServices } from '../../electron/main/ipc/register'
import { SenderRegistry } from '../../electron/main/ipc/validateSender'
import { EngineSupervisor } from '../../electron/main/engine/EngineSupervisor'
import { translateCommand } from '../../electron/main/engine/translateCommand'
import { PUSH } from '../../electron/shared/contracts'
const root = process.env.M03_ROOT!
const output = process.env.M03_OUTPUT!
app.setPath('userData', process.env.M03_PROFILE!)
protocol.registerSchemesAsPrivileged([{scheme:'app',privileges:{standard:true,secure:true,supportFetchAPI:true}}])
const engine = new EngineSupervisor({onEvent:event => {
  for(const window of BrowserWindow.getAllWindows()) window.webContents.send(PUSH.engineEvent,event)
}})
const timeout = setTimeout(() => { console.error('M03 timeout'); void engine.shutdown().finally(() => app.exit(1)) },60000)
async function run() {
  await app.whenReady()
  protocol.handle('app', async request => {
    const resolved = resolveAppUrl(request.url,join(root,'m03-dist'))
    if(!resolved.ok) return new Response('',{status:404})
    return new Response(await readFile(resolved.path),{headers:{'Content-Type':contentTypeFor(resolved.path)}})
  })
  const registry = new SenderRegistry('app://rinari')
  registerIpc(registry,{
    engine:{
      status:()=>engine.status(), start:()=>engine.start(), shutdown:()=>engine.shutdown(),restart:()=>engine.restart(),
      request:(command,params) => { const call = translateCommand(command,params??{}); return engine.request(call.method,call.params) },
    },
    clipboard:{writeText:text=>clipboard.writeText(text)},
  } as HostServices)
  const window = createMainWindow({
    preloadPath:join(root,'dist-electron/preload.cjs'), startUrl:process.env.M03_FILES==='1'?'app://rinari/?files=1':'app://rinari', trustedOrigin:'app://rinari',
    cspMode:'production',onState:()=>{},onCloseRequested:()=>{},isQuitCommitted:()=>true,
  })
  registry.trust(window.webContents.id)
  const visibleStates: boolean[] = []
  window.on('show',()=>visibleStates.push(window.isMaximized()))
  const evaluate = (code:string) => window.webContents.executeJavaScript(code)
  const wait = async (condition:string) => {
    const deadline=Date.now()+10000
    while(Date.now()<deadline) { if(await evaluate(condition)) return; await new Promise(r=>setTimeout(r,20)) }
    throw new Error('Timed out: '+condition)
  }
  await mkdir(output,{recursive:true})
  if (process.env.M03_FILES==='1') {
    await wait('Boolean(window.m03Files)')
    const target=join(process.env.M03_PROFILE!,'external','preview.md')
    await evaluate(`window.m03Files.open(${JSON.stringify(target)}, 'turn_fixture')`)
    await wait("document.body.textContent.includes('External version one')")
    await writeFile(join(output,'file-before.png'),(await window.webContents.capturePage()).toPNG())
    await writeFile(target,'# External version two\n')
    await wait("document.body.textContent.includes('External version two')")
    assert(await evaluate('window.m03Files.selected.file.changed_since_turn'))
    assert.equal(await evaluate('window.m03Files.selected.file.provenance'),'turn_changeset')
    await writeFile(join(output,'file-changed.png'),(await window.webContents.capturePage()).toPNG())
    await unlink(target)
    await wait("window.m03Files.selected.state === 'deleted'")
    assert(await evaluate("document.body.textContent.includes('External version two')"))
    await writeFile(target,'# External version three\n')
    await wait("document.body.textContent.includes('External version three')")
    await writeFile(target,Buffer.from([0,255]))
    await wait('Boolean(window.m03Files.selected.syncError)')
    assert(await evaluate("document.body.textContent.includes('External version three')"))
    await writeFile(join(output,'file-stale.png'),(await window.webContents.capturePage()).toPNG())
    await evaluate('window.m03Files.close(window.m03Files.selected.key)')
    await wait('window.m03Files.tabs.length === 0')
    await writeFile(join(output,'report.json'),JSON.stringify({ok:true,realEngine:true,external:true,changed:true,deleted:true,recreated:true,binaryRetainsLastView:true,closed:true},null,2))
    console.log('RINARI_M03 '+JSON.stringify({ok:true,realEngine:true,output}))
    return
  }
  await wait('Boolean(window.m03)')
  if (!window.isVisible()) await new Promise<void>(resolve => window.once('show', () => resolve()))
  assert(window.isMaximized())
  assert(visibleStates.length === 1 && visibleStates.every(Boolean),'first visible frame must be maximized')
  const [maximizedWidth] = window.getContentSize()
  window.unmaximize()
  focusExistingWindow(window)
  assert(!window.isMaximized(),'second instance must preserve normal size')
  if (process.env.M03_NARROW === '1') {
    // La restauración termina después de `unmaximize` (el renderer aún mide el
    // tamaño maximizado) y pisaba el `setContentSize`: «narrow» medía 1280 px.
    // Se espera a que host y renderer hayan salido del tamaño maximizado.
    const deadline = Date.now() + 10000
    for (;;) {
      const [width] = window.getContentSize()
      if (width !== maximizedWidth && await evaluate('innerWidth') === width) break
      if (Date.now() > deadline) throw new Error('Timed out: restore after unmaximize')
      await new Promise(r => setTimeout(r, 20))
    }
    window.setMinimumSize(480, 600)
    window.setContentSize(640, 760)
    await wait('Math.abs(innerWidth - 640) <= 2')
  }
  if (process.env.M03_REDUCED === '1') await evaluate('window.m03.reducedMotion()')
  await evaluate('window.m03.create()')
  await wait("document.querySelector('[data-presentation=empty]') !== null")
  const fresh = await evaluate('window.m03.status()')
  assert.equal(fresh.phase,'loaded')
  await evaluate("void window.m03.select('empty')")
  await wait("document.querySelector('[data-testid=chat-loading]') !== null")
  assert.equal(await evaluate("document.querySelector('textarea') === null"),true)
  await wait("document.querySelector('[data-presentation=empty]') !== null")
  await evaluate("void window.m03.select('content')")
  await wait("document.querySelector('[data-testid=chat-loading]') !== null")
  await wait("document.body.textContent.includes('Persisted answer')")
  await evaluate("void window.m03.select('error')")
  await wait("document.body.textContent.includes('No se pudo cargar')")
  assert.equal(await evaluate("document.querySelector('textarea') === null"),true)
  await evaluate('window.m03.retry()')
  await wait("document.querySelector('[data-presentation=empty]') !== null")
  await evaluate("void window.m03.select('slow-a'); void window.m03.select('b'); void window.m03.select('c')")
  await wait("window.m03.status().id === 'c' && window.m03.status().phase === 'loaded'")
  await new Promise(r=>setTimeout(r,600))
  assert.equal((await evaluate('window.m03.status()')).id,'c')

  await evaluate("window.m03.draft('M03 first message')")
  await wait("document.querySelector('textarea')?.value === 'M03 first message'")
  await evaluate(`(() => {
    const node=document.querySelector('textarea'); node.focus(); node.style.height='96px'
    window.m03Node=node
    window.m03Frames=[]
    let remaining=35
    const sample=()=>{ const current=document.querySelector('textarea');const r=current?.getBoundingClientRect()
      window.m03Frames.push({same:current===node,focus:document.activeElement===node,x:r? r.x+r.width/2:null,width:r?.width,time:performance.now()})
      if(--remaining) requestAnimationFrame(sample)
    }; sample()
  })()`)
  await mkdir(output,{recursive:true})
  await writeFile(join(output,'before.png'),(await window.webContents.capturePage()).toPNG())
  const recording = process.env.M03_VIDEO === '1' ? (async () => {
    const dir=join(output,'frames'); await mkdir(dir,{recursive:true})
    for(let i=0;i<24;i++) {
      await writeFile(join(dir,String(i).padStart(3,'0')+'.png'),(await window.webContents.capturePage()).toPNG())
      await new Promise(resolve=>setTimeout(resolve,50))
    }
  })() : Promise.resolve()
  window.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'})
  window.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'})
  await wait("document.querySelector('[data-presentation=conversation]') !== null")
  await wait('window.m03Frames.length >= 35')
  const frames=await evaluate('window.m03Frames')
  assert(frames.every((f:any)=>f.same && f.focus),'composer identity/focus lost')
  const xs=frames.map((f:any)=>f.x)
  const drift=Math.max(...xs)-Math.min(...xs)
  assert(drift<=1,'composer drift: '+drift)
  await recording
  await wait("document.querySelector('.home-hero') === null")
  await writeFile(join(output,'after.png'),(await window.webContents.capturePage()).toPNG())
  assert(await evaluate("window.m03.copy('session_m03_fixture')"))
  assert.equal(await clipboard.readText(),'session_m03_fixture')
  const rejected=await evaluate(`Promise.all([
    window.rinariDesktop.clipboard.writeText(123),
    window.rinariDesktop.clipboard.writeText('é'.repeat(524289))
  ].map(p=>p.then(()=>false,()=>true)))`)
  assert(rejected.every(Boolean))
  const display=await evaluate('({dpr:devicePixelRatio,width:innerWidth,height:innerHeight})')
  const report={ok:true,display,reducedMotion:process.env.M03_REDUCED==='1',visibleStates,firstSend:{frames,drift},clipboard:true,history:true}
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2))
  console.log('RINARI_M03 '+JSON.stringify({ok:true,drift,output}))
}
void run().then(async()=>{clearTimeout(timeout);await engine.shutdown();app.exit(0)},async error=>{
  console.error(error);clearTimeout(timeout);await engine.shutdown();app.exit(1)
})

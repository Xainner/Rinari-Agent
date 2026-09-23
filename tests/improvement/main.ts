import { app, BrowserWindow, protocol } from 'electron'
import { readFile,writeFile,mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { resolveAppUrl,contentTypeFor,contentSecurityPolicy } from '../../electron/main/appScheme'
const root=process.env.EVIDENCE_ROOT!
const which=process.env.EVIDENCE_CASE!
const output=join(root,'evidence',which+'-'+(process.env.EVIDENCE_SCALE??'1'))
app.setPath('userData',process.env.EVIDENCE_PROFILE!)
protocol.registerSchemesAsPrivileged([{scheme:'app',privileges:{standard:true,secure:true,supportFetchAPI:true}}])
const timer=setTimeout(()=>{console.error('Evidence timeout');app.exit(1)},60000)
async function run(){
 await app.whenReady()
 protocol.handle('app',async request=>{
  const r=resolveAppUrl(request.url,join(root,'evidence-dist'))
  if(!r.ok)return new Response('',{status:404})
  return new Response(await readFile(r.path),{headers:{'Content-Type':contentTypeFor(r.path),'Content-Security-Policy':contentSecurityPolicy()}})
 })
 const window=new BrowserWindow({width:1180,height:820,show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}})
 window.webContents.on('console-message',(_e,level,message)=>{if(level>=2)console.error(message)})
 await window.loadURL('app://rinari')
 window.showInactive()
 const js=(code:string)=>window.webContents.executeJavaScript(code)
 const sleep=(n:number)=>new Promise(r=>setTimeout(r,n))
 const wait=async(code:string)=>{for(let i=0;i<250;i++){if(await js(code))return;await sleep(20)}throw Error('Timed out: '+code)}
 await wait('Boolean(window.fixture)')
 await mkdir(output,{recursive:true})
 let frame=0
 const shot=async(name:string,delay=120)=>{await sleep(delay);let data:Buffer|undefined;for(let attempt=0;attempt<5;attempt++){try{data=(await window.webContents.capturePage()).toPNG();if(data.length)break}catch(error){if(!String(error).includes('UnknownVizError'))throw error}await sleep(200)}assert(data&&data.length>0,'No composited capture after five attempts');await writeFile(join(output,name+'.png'),data);await writeFile(join(output,'frame-'+String(frame++).padStart(3,'0')+'.png'),data)}
 const click=async(label:string)=>{const found=await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)})?.click() ?? null`); await sleep(280);return found}
 const report:Record<string,unknown>={case:which,scale:process.env.EVIDENCE_SCALE??'1',fixture:true,origin:'app://rinari'}
 if(which==='04'){
  await js('window.fixture.start()')
  const length=await js('window.fixture.traceLength')
  for(let i=0;i<length;i++){
   await js(`window.fixture.step(${i})`);await shot('usage-step-'+i)
   if(i===0)assert((await js("document.querySelector('[data-testid=token-usage]').textContent")).includes('~'))
  }
  assert.equal(await js("document.querySelector('[data-testid=turn-meta] [data-testid=token-usage]').textContent"),'14.2K tokens')
  assert.equal(await js("document.querySelectorAll('[data-testid=token-usage]').length"),1)
  report.terminalTotal=await js('window.fixture.usage()')
  report.source='Recorded production AgentLoop events with a deterministic streaming provider'
 }else if(which==='05'){
  await shot('question-1')
  await click('Inspeccionar')
  assert.equal(await js("document.querySelector('h3').textContent"),'¿Qué alcance?')
  assert.equal(await js('window.fixture.calls()'),0)
  await click('Otra');await shot('other-empty')
  assert.equal(await js('document.activeElement.tagName'),'TEXTAREA')
  assert.equal(await js('document.querySelector("textarea").value'),'')
  await window.webContents.insertText('Solo UI\ny pruebas')
  await shot('other-draft')
  await click('Continuar')
  assert.equal(await js("document.querySelector('h3').textContent"),'¿Confirmamos?')
  await js("document.querySelector('[aria-label=\"Pregunta anterior\"]').click()")
  await shot('back-preserves-draft')
  assert.equal(await js('document.querySelector("textarea").value'),'Solo UI\ny pruebas')
  await click('Continuar');await click('Sí')
  assert.equal(await js('window.fixture.calls()'),0)
  await shot('last-waits')
  await click('Enviar respuestas')
  assert.equal(await js('window.fixture.calls()'),1)
  report.answers=await js('window.fixture.answers()')
  await shot('submitted')
 }else if(which==='06'){
  for(const mode of ['normal','board']){
   for(let i=0;i<4;i++){
    await js(`window.fixture.show(${i},${JSON.stringify(mode)})`);await sleep(150);await shot(mode+'-state-'+i)
    const count=await js("document.querySelectorAll('[data-testid=coverage-warning]').length")
    assert.equal(count,i===1?1:0)
    if(i<2)assert.equal(await js("document.querySelectorAll('button').length"),0)
    if(i===1){
     window.focus();window.webContents.focus();await sleep(100)
     await js('document.querySelector("summary").focus()')
     window.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'})
     window.webContents.sendInputEvent({type:'char',keyCode:'\r'})
     await sleep(100);assert(await js('document.querySelector("details").open'))
    }
   }
  }
  report.matrix='4 states at normal/board widths; keyboard details passed'
 }else{
  const results=[]
  for(const width of [1000,760,560,420]){
   await js(`window.fixture.width(${width})`);await sleep(150)
   const geometry=await js('window.fixture.geometry()')
   assert(geometry.every((g:any)=>Math.abs(g.rightError)<=1&&!g.overflow),JSON.stringify(geometry))
   if(width>=760)assert.equal(geometry[1].lines,1)
   assert.equal(geometry[0].lines,1)
   results.push({width,geometry})
   await shot('bubbles-'+width)
  }
  await js('window.fixture.width(1000);window.fixture.longDraft()');await sleep(100)
  assert.equal(await js('document.querySelector("textarea").getBoundingClientRect().height'),240)
  await shot('composer-expanded')
  await js('window.fixture.captureSend()')
  for(let i=0;i<7;i++){await shot('composer-reset-'+i,10)}
  await wait('window.fixture.samples().length>5')
  const samples=await js('window.fixture.samples()')
  const minimum=await js('parseFloat(getComputedStyle(document.querySelector("textarea")).minHeight)')
  assert(Math.abs(samples.at(-1)-minimum)<1)
  assert(samples.some((x:number)=>x>minimum+1&&x<239),'actual intermediate heights required')
  await js('window.fixture.reduced();window.fixture.longDraft()');await sleep(100)
  await js('window.fixture.send()');await sleep(20)
  assert.equal(await js('document.querySelector("textarea").getAnimations().length'),0)
  report.geometry=results;report.heightSamples=samples;report.minimum=minimum;report.reducedMotion=true
 }
 await writeFile(join(output,'report.json'),JSON.stringify({ok:true,...report},null,2))
 console.log('RINARI_EVIDENCE '+JSON.stringify({ok:true,output,...report}))
 window.destroy()
}
run().then(()=>{clearTimeout(timer);app.exit(0)},error=>{console.error(error);clearTimeout(timer);app.exit(1)})


const assert = require('node:assert/strict')
const { ui, scenario, command, useLocalModel, seedBoard, panesFor, click, clickText, input, key, evaluate, wait, until, delay, size, screenshot, report } = require('../harness.cjs')
const pending = () => fetch(new URL('/__pending?lane=main', ui.model)).then(r=>r.json())
async function release() {
  await until(async()=>await pending()>0,'scripted model waiting')
  await fetch(new URL('/__release?lane=main',ui.model))
}
async function send(text) {
  await input('.composer-surface textarea',text)
  // A completion toast can cover the send button after switching from Boards.
  // Use the real keyboard path so that notification timing cannot swallow the click.
  await click('.composer-surface textarea')
  await key('Enter')
}
const state = (selector='.activity-text-shimmer') => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),s=getComputedStyle(e),r=e.getBoundingClientRect();return {animation:s.animationName,position:s.backgroundPosition,fill:s.webkitTextFillColor,width:r.width,height:r.height,text:e.textContent}})()`)
const still = async (selector) => { let s; await until(async()=>{s=await state(selector);return s.animation==='none'&&s.fill!=='rgba(0, 0, 0, 0)'},'reduced motion applied to the sheen'); return s }
async function moving(selector) {
  const before=await state(selector); await delay(350); const after=await state(selector)
  assert.equal(before.animation,'activity-text-sheen')
  assert.notEqual(before.position,after.position)
  assert.equal(before.width,after.width); assert.equal(before.height,after.height)
}
async function seamlessCycle(selector, name) {
  const select=JSON.stringify(selector)
  const duration=await evaluate(`(async()=>{const a=document.querySelector(${select}).getAnimations().find(a=>a.animationName==='activity-text-sheen');a.pause();await a.ready;return a.effect.getTiming().duration})()`)
  const frames=[]
  for(const fraction of [0,0.001,0.5,0.999,1,1.001]){
    await evaluate(`document.querySelector(${select}).getAnimations().find(a=>a.animationName==='activity-text-sheen').currentTime=${duration*fraction}`)
    await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))`)
    // capturePage can still return the previous compositor frame under CPU load.
    await delay(150)
    const rect=await evaluate(`(()=>{const r=document.querySelector(${select}).getBoundingClientRect();return {x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)}})()`)
    const capture=await ui.win.webContents.capturePage(rect)
    frames.push(capture.toBitmap())
    require('node:fs').writeFileSync(require('node:path').join(ui.output,`${name}-${fraction}.png`),capture.toPNG())
  }
  for(const i of [1,3,4,5]) assert(frames[0].equals(frames[i]),`${name}: the band must be fully outside the text across the loop boundary`)
  assert(!frames[0].equals(frames[2]),`${name}: the middle of the sweep must visibly highlight the text`)
  await evaluate(`document.querySelector(${select}).getAnimations().find(a=>a.animationName==='activity-text-sheen').play()`)
}
// The CI's Windows runner reports system animations off (prefers-reduced-motion: reduce),
// which correctly disables the sheen. Emulate an explicit baseline so the scenario
// tests the same thing on every machine; individual steps override it below.
const MOTION={name:'prefers-reduced-motion',value:'no-preference'}
const emulate=(features=[])=>ui.win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[...(features.some(f=>f.name===MOTION.name)?[]:[MOTION]),...features]})
scenario(async()=>{
  ui.win.webContents.debugger.attach('1.3')
  await emulate()
  await useLocalModel()
  const ids=[]
  for(const title of ['Brillo de actividad','Panel vecino']) ids.push((await command('session_create',{chat:true,title,permission_profile:'full-access'})).session.id)
  await seedBoard({panes:panesFor(ids),focusedPaneId:'pane_0'})
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Brillo de actividad','aside button',{includes:true})
  await send('Ejecuta la prueba local')
  await wait(`Boolean(document.querySelector('.activity-text-shimmer'))`)
  await until(async()=>await pending()>0,'initial model request')
  await delay(150)
  await moving()
  await release(); await release()
  const group='[data-activity-disclosure="operations"] .activity-text-shimmer'
  await wait(`Boolean(document.querySelector('${group}'))`)
  await moving(group)
  await seamlessCycle('[data-live-activity] .activity-text-shimmer','status-cycle')
  await seamlessCycle(group,'group-cycle')
  assert(await evaluate(`![...document.querySelectorAll('.activity-text-shimmer')].some(e=>e.textContent.includes('Voy a ejecutar'))`),'public progress is not animated')
  await screenshot('normal-running')
  await click('[data-activity-disclosure="operations"] button[aria-expanded]')
  assert.equal(await evaluate(`document.querySelectorAll('[data-operation-group] details > summary .activity-text-shimmer').length`),1,'only the active command moves')
  await screenshot('operations-open')
  await click('.view-switcher button[aria-label^="Boards"]')
  await wait(`Boolean(document.querySelector('${group}'))`)
  await moving(group)
  assert.equal(await evaluate(`document.querySelectorAll('[data-pane-id="pane_1"] .activity-text-shimmer').length`),0)
  await screenshot('boards-running')
  await size(950,760)
  await screenshot('boards-narrow')
  await emulate([{name:'prefers-reduced-motion',value:'reduce'}])
  // Chromium applies the media change on a later rendered frame, and a slow runner
  // may need several: wait for the still, solid text instead of a fixed delay.
  let s=await still(group); assert.equal(s.animation,'none'); assert.notEqual(s.fill,'rgba(0, 0, 0, 0)')
  await screenshot('system-reduced-motion')
  await emulate()
  await evaluate(`document.documentElement.dataset.motion='reduced'`)
  s=await still(group); assert.equal(s.animation,'none'); assert.notEqual(s.fill,'rgba(0, 0, 0, 0)')
  await evaluate(`delete document.documentElement.dataset.motion`)
  await emulate([{name:'forced-colors',value:'active'}])
  s=await still(group); assert.equal(s.animation,'none'); assert.notEqual(s.fill,'rgba(0, 0, 0, 0)')
  await emulate()
  await size(1400,900)
  await moving(group)
  await until(async()=>await pending()>0,'command completed',45000)
  assert.equal(await evaluate(`document.querySelectorAll('[data-operation-group] .activity-text-shimmer').length`),0,'finished operations stop while model thinks')
  await release()
  await wait(`document.body.innerText.includes('ACTIVIDAD TERMINADA')`)
  await wait(`!document.querySelector('.activity-text-shimmer')`)
  await click('[data-pane-id="pane_0"] button[aria-label="Ver actividad del turno"]')
  assert.equal(await evaluate(`document.querySelectorAll('.activity-text-shimmer').length`),0,'historical inspection stays still')
  await screenshot('completed-static')
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Brillo de actividad','aside button',{includes:true})
  await send('Prueba de cancelación')
  await until(async()=>await pending()>0,'cancellable model request')
  await wait(`Boolean(document.querySelector('.activity-text-shimmer'))`)
  await click('.composer-surface button[aria-label="Detener generación"]')
  await wait(`!document.querySelector('.activity-text-shimmer')`)
  await release() // drain the cancelled request before the demonstration
  report({passed:['moving text in Normal and Boards','single and grouped operations','pixel-identical loop boundary before and after restart','visible highlight in the middle of the cycle','no duplicated text or height shifts','completed operations static','reduced motion in app and OS','forced colors','narrow window','terminal history static','cancellation stops motion']})
  if(ui.keep){
    await send('Ver la demostración del brillo')
    await release(); await release()
    await wait(`Boolean(document.querySelector('${group}'))`)
  }
},{width:1400,height:900})

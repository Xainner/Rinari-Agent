const assert = require('node:assert/strict')
const { click, clickText, command, evaluate, input, key, panesFor, q, reload, report, scenario, screenshot, seedBoard, useLocalModel, wait, until, delay, size, ui } = require('../harness.cjs')
const show = 'button[aria-label="Ver actividad del turno"]'
const hide = 'button[aria-label="Ocultar actividad del turno"]'
const body = '[data-activity-body]'
const scroller = '.conversation-enter > .overflow-y-auto'
const pending = () => fetch(new URL('/__pending?lane=main', ui.model)).then(r => r.json())
async function release() {
  await until(async () => await pending() > 0, 'model waits for next step')
  assert.equal(await fetch(new URL('/__release?lane=main', ui.model)).then(r => r.json()), true)
}
async function send(prefix, message) {
  await input(prefix + ' .composer-surface textarea', message)
  await click(prefix + ' .composer-surface button[aria-label="Enviar mensaje"]')
}
scenario(async () => {
  await useLocalModel()
  const ids = []
  for (const title of ['Actividad A', 'Actividad B']) ids.push((await command('session_create', { chat: true, title })).session.id)
  await seedBoard({ boardId: 'activity', panes: panesFor(ids), focusedPaneId: 'pane_0' })
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Actividad A', 'aside button', { includes: true })
  await send('', 'Revisa los archivos locales paso a paso')
  await release()
  await until(async () => await pending() > 0, 'first progress classified')
  await wait(`document.body.innerText.includes('PROGRESO 1')`)
  assert.equal(await evaluate(`Boolean(${q(body)})`), false)
  assert.equal(await evaluate(`Boolean(${q(show)})`), false, 'running legend never folds the turn')
  assert(await evaluate(`document.body.innerText.includes('En proceso desde hace')`))
  await screenshot('normal-live-visible')
  await evaluate(`${q('[data-operation-group] details > summary')}.click()`)
  await wait(`Boolean(document.querySelector('[data-operation-group] details[open]'))`)
  await evaluate(`${q('[data-operation-group] details > summary')}.focus()`)
  ui.win.focus()
  await key('Space')
  await wait(`!document.querySelector('[data-operation-group] details').open`)
  assert(await evaluate(`document.activeElement === ${q('[data-operation-group] details > summary')}`), 'Space preserves focus on the summary')
  // Native <summary> activates on Enter's character event in Chromium.
  // The harness key() sends down/up only (sufficient for React key handlers).
  ui.win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' })
  ui.win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' })
  ui.win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' })
  await wait(`document.querySelector('[data-operation-group] details').open`)
  // Keep the user's instruction at its chronological boundary.
  await click('.composer-surface textarea')
  await input('.composer-surface textarea', 'INSTRUCCIÓN INTERCALADA: conserva todos los detalles')
  await key('Enter')
  await wait(`document.body.innerText.includes('INSTRUCCIÓN INTERCALADA')`)
  await release()
  await until(async () => await pending() > 0, 'second progress classified')
  await wait(`document.body.innerText.includes('PROGRESO 2')`)
  assert(await evaluate(`Boolean(document.querySelector('[data-operation-group] details[open]'))`), 'inspection survives steering')
  await release()
  await until(async () => await pending() > 0, 'third progress classified after steering was applied')
  await wait(`document.body.innerText.includes('PROGRESO 3')`)
  assert(await evaluate(`(()=>{const nodes=[...document.querySelectorAll('[data-activity-item], [data-testid="steer-message"]')];const a=nodes.findIndex(n=>n.innerText.includes('PROGRESO 2')),b=nodes.findIndex(n=>n.dataset.testid==='steer-message'),c=nodes.findIndex(n=>n.innerText.includes('PROGRESO 3'));return a<b&&b<c})()`), 'progress remains on both sides of the instruction')
  for (let step = 4; step <= 24; step++) await release()
  await until(async () => await pending() > 0, 'final response pending')
  assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(show)}).length`), 0)
  assert(await evaluate(`document.body.innerText.includes('PROGRESO 24')`))
  const liveBodies = await evaluate(`document.querySelectorAll('[data-operation-group] [data-activity-body]').length`)
  assert.equal(liveBodies, 1, 'only the inspected operation mounts its heavy contents')
  const nodesDuringExecution = await evaluate(`document.querySelectorAll('*').length`)
  // Nested inspection survives a switch of view; no Engine reload.
  await click('.view-switcher button[aria-label^="Boards"]')
  const a = '[data-pane-id="pane_0"]'
  const b = '[data-pane-id="pane_1"]'
  await wait(`Boolean(${q(a + ' [data-operation-group] details[open]')})`)
  // Boards se monta de nuevo al cambiar de vista; en una máquina lenta el texto llega un poco después.
  await wait(`${q(a)}.innerText.includes('PROGRESO 24')`)
  await clickText('Colapsar todo')
  assert.equal(await evaluate(`Boolean(${q(a + ' [data-operation-group] details')})`), false)
  await clickText('Expandir todo')
  // En el runner la ventana a veces no pinta y la animación de desplegar no
  // avanza: se congela aquí a propósito y el panel debe llegar igual a su ancho.
  // Solo las del plegado de paneles: `<html>` también lleva data-motion con
  // movimiento reducido, y congelar todo dejaba la app entera en su fotograma 0.
  await evaluate(`for(const an of document.getAnimations())if(/^pane-(unfold|unfold-fit|fold|content-in)$/.test(an.animationName))an.pause()`)
  await wait(`!document.querySelector('${a}[data-motion]') && ${q(a)}.getBoundingClientRect().width > 300`)
  await wait(`Boolean(${q(a + ' [data-operation-group] details[open]')})`)
  await release()
  await wait(`${q(a)}.innerText.includes('RESULTADO COMPLETO')`)
  await wait(`${q(a)}.innerText.includes('Ha trabajado durante')`)
  assert.equal(await evaluate(`${q(a)}.querySelectorAll('[data-testid="turn-result"]').length`), 1)
  assert.equal(await evaluate(`${q(a)}.querySelectorAll(${JSON.stringify(show)}).length`), 2, 'completion folds every segment even when inspection was open')
  assert.equal(await evaluate(`${q(a)}.querySelectorAll(${JSON.stringify(body)}).length`), 0)
  assert.equal(await evaluate(`${q(a)}.innerText.includes('PROGRESO 1')`), false)
  await evaluate(`${q(a + ' ' + scroller)}.scrollTop=0`)
  await screenshot('boards-final-folded')
  await evaluate(`for(const b of ${q(a)}.querySelectorAll(${JSON.stringify(show)}))b.click()`)
  await wait(`${q(a)}.querySelectorAll(${JSON.stringify(hide)}).length===2`)
  assert(await evaluate(`${q(a + ' [data-operation-group] details')}.open`), 'reopening final summary restores the inspected operation')
  const nodesOpen = await evaluate(`${q(a)}.querySelectorAll('*').length`)
  await screenshot('boards-final-open')
  const turnId = await evaluate(`${q(a + ' [data-testid="turn-result"]')}.dataset.turnId`)
  await evaluate(`window.dispatchEvent(new CustomEvent('rinari:reveal-turn',{detail:{sessionId:${JSON.stringify(ids[0])},turnId:${JSON.stringify(turnId)}}}))`)
  await wait(`Math.abs(${q(a + ' [data-testid="turn-result"]')}.getBoundingClientRect().top-${q(a + ' ' + scroller)}.getBoundingClientRect().top)<8`)

  // Collapse from below a large body: the control remains visible and focused.
  const controls = await evaluate(`${q(a)}.querySelectorAll(${JSON.stringify(hide)}).length`)
  for (let i = 0; i < controls; i++) {
    // Centre the control inside the pane, away from the sticky board header.
    // Let both result-navigation frames finish before measuring a mouse target.
    await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`)
    await evaluate(`${q(a + ' ' + hide)}.scrollIntoView({behavior:'instant',block:'center'})`)
    await click(a + ' ' + hide)
    await wait(`${q(a)}.querySelectorAll(${JSON.stringify(hide)}).length===${controls - i - 1}`)
  }
  assert.equal(await evaluate(`${q(a)}.querySelectorAll(${JSON.stringify(body)}).length`), 0)
  assert(await evaluate(`${q(a)}.innerText.includes('Párrafo final 35')`))
  assert(await evaluate(`(()=>{const b=document.activeElement,r=b.getBoundingClientRect(),v=${q(a + ' ' + scroller)}.getBoundingClientRect();return r.top>=v.top-2&&r.bottom<=v.bottom+2})()`), 'collapse keeps the focused header visible')
  const nodesClosed = await evaluate(`${q(a)}.querySelectorAll('*').length`)
  assert(nodesClosed < nodesOpen, 'folding actually unmounts activity DOM')
  const expandTwoFramesMs = await evaluate(`new Promise(resolve=>{const start=performance.now(),b=${q(a + ' ' + show)};b.focus();b.click();requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(performance.now()-start)))})`)
  ui.win.focus()
  await key('Space')
  await wait(`document.activeElement?.getAttribute('aria-expanded')==='false'`)
  ui.win.show()
  if (ui.win.isMinimized()) ui.win.restore()
  await delay(300)
  await size(1000, 760)
  await ui.win.webContents.debugger.attach('1.3')
  await ui.win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  assert(await evaluate(`matchMedia('(prefers-reduced-motion: reduce)').matches`))
  await screenshot('boards-narrow-reduced-motion')
  await ui.win.webContents.debugger.detach()
  await size(1500, 900)
  // The neighbour has its own execution and disclosure state.
  await send(b, 'Prueba del fallo recuperable')
  await release()
  await wait(`${q(b)}.innerText.includes('El turno falló')`, 60000)
  assert(await evaluate(`Boolean(${q(b + ' [role="alert"]')})`))
  await screenshot('boards-failure-outside')
  await send(b, 'Continúa después del error')
  await release()
  await wait(`${q(b)}.innerText.includes('RESPUESTA PARA EL PANEL VECINO')`)
  // Cancel a real held provider request; its late answer must not revive the turn.
  await evaluate(`${q(a + ' ' + scroller)}.scrollTop=100`)
  const readingBefore = await evaluate(`${q(a + ' ' + scroller)}.scrollTop`)
  await send(b, 'Cancela esta ejecución mientras espera al proveedor')
  await until(async () => await pending() > 0, 'cancellable model request pending')
  await click(b + ' .composer-surface button[aria-label="Detener generación"]')
  await wait(`/Turno (cancelado|detenido)/.test(${q(b)}.innerText)`)
  await release()
  await delay(300)
  assert.equal(await evaluate(`${q(b)}.innerText.includes('ESTA RESPUESTA CANCELADA NO DEBE APARECER')`), false)
  assert.equal(await evaluate(`${q(a + ' ' + scroller)}.scrollTop`), readingBefore, 'the other panel keeps its reading position')
  await screenshot('boards-cancelled')
  // A reload reconstructs the real persisted timeline, but UI disclosure is session-memory only.
  await reload()
  await click('.view-switcher button[aria-label^="Boards"]')
  // History rows arrive and are measured separately; a slower machine paints the result later.
  await wait(`Boolean(${q(a + ' ' + scroller)})`)
  await wait(`${q(a)}.innerText.includes('RESULTADO COMPLETO')`)
  assert.equal(await evaluate(`${q(a)}.querySelectorAll(${JSON.stringify(body)}).length`), 0)
  // The pane reopens at the end and the list mounts only nearby rows: the
  // turn's activity control sits above the long answer, so scroll up first.
  await evaluate(`for(const el of document.querySelectorAll(${JSON.stringify(scroller)})){el.scrollTop=0;el.dispatchEvent(new Event('scroll'))}`)
  await wait(`Boolean(${q(a + ' ' + show)})`)
  assert.equal(await evaluate(`${q(a)}.querySelectorAll(${JSON.stringify(body)}).length`), 0)
  await screenshot('history-restored')
  // Keep manual test turns slow enough to inspect their live presentation.
  if (ui.keep) setInterval(() => { void fetch(new URL('/__release?lane=main', ui.model)).catch(() => {}) }, 4000)
  report({ nodesDuringExecution, nodesOpen, nodesClosed, expandTwoFramesMs, passed: ['live progress remains visible after classification', 'operation contents mount only when opened', 'steering visible in chronological segments', 'completion folds all segments including open inspection', 'reopening restores inspection after Normal/Boards', 'nested inspection restored after panel collapse', 'real cancellation and ignored late provider answer', 'other panel reading position preserved', 'complete final outside activity', 'keyboard', 'narrow Boards', 'reduced motion', 'provider failure outside and new turn recovery', 'history replay starts folded'] })
}, { width: 1500, height: 900 })

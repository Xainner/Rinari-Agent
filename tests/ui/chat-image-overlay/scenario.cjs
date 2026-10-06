// El visor de adjuntos cubre toda la ventana (no el contenedor del mensaje),
// bloquea el desplazamiento del fondo y conserva el foco, en Normal y Boards,
// para adjuntos del historial y del composer. Los textos largos se desplazan
// dentro del visor.
const { dialog } = require('electron')
const assert = require('node:assert/strict')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { ui, click, clickAt, clickText, command, evaluate, input, key, panesFor, q, reload, report, scenario, screenshot, seedBoard, size, useLocalModel, wait, wheel, delay } = require('../harness.cjs')

const scroller = '.conversation-enter > .overflow-y-auto'
const preview = '[role="dialog"][aria-label^="Vista previa"]'
const historical = 'button[title="Abrir vista previa"]'

async function attach(prefix, name) {
  // Solo se guioniza la elección del archivo; la validación del host y la
  // preparación del Engine son las normales.
  const originalDialog = dialog.showOpenDialog
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [join(ui.data, name)] })
  try {
    await click(prefix + ' .composer-surface button[aria-label="Adjuntar archivos"]')
    await clickText('Adjuntar desde el equipo', 'button', { includes: true })
    await wait(`${q(prefix + ' .composer-surface')}.textContent.includes(${JSON.stringify(name)})`)
    await wait(`!${q(prefix + ' .composer-surface .animate-spin')}`)
  } finally {
    dialog.showOpenDialog = originalDialog
  }
}
async function startOfChat(prefix = '') {
  await wait(`${q(prefix + ' ' + scroller)}?.scrollHeight>4000`)
  // La carga y las medidas del virtualizador pueden restaurar un ancla de
  // lectura: se navega después y se avisa al manejador de scroll real.
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    await evaluate(`(()=>{const e=${q(prefix + ' ' + scroller)};e.scrollTop=0;e.dispatchEvent(new Event("scroll"))})()`)
    await delay(300)
    if (await evaluate(`Boolean(${q(prefix + ' ' + historical)})`)) return
  }
  throw new Error('Image attachment did not become visible at start of chat')
}
const metrics = []
async function verify(prefix, name) {
  await wait(`${q(preview + ' img')}?.naturalWidth>0`)
  await delay(300)
  const before = await evaluate(`(() => {const d=${q(preview)}; const r=d.getBoundingClientRect(); const o=d.previousElementSibling.getBoundingClientRect();return {rect:r.toJSON(),overlay:o.toJSON(),width:innerWidth,height:innerHeight,portal:!d.closest(".conversation-enter,.composer-root,[data-pane-id]"),scrolls:[...document.querySelectorAll(${JSON.stringify(scroller)})].map(e=>e.scrollTop)}})()`)
  assert(before.portal, name + ': dialog belongs to the window')
  assert.equal(before.overlay.x, 0); assert.equal(before.overlay.y, 0)
  assert.equal(before.overlay.width, before.width); assert.equal(before.overlay.height, before.height)
  assert(Math.abs(before.rect.x + before.rect.width / 2 - before.width / 2) < 2)
  assert(Math.abs(before.rect.y + before.rect.height / 2 - before.height / 2) < 2)
  for (const delta of [-2500, 2500, -5000, 5000]) {
    await wheel(Math.round(before.width / 2), Math.round(before.height / 2), delta)
    await wheel(30, Math.round(before.height / 2), delta)
  }
  for (const code of ['PageDown', 'PageUp', 'Home', 'End', 'Tab']) await key(code)
  assert(await evaluate(`Boolean(${q(preview)})`), name + ': viewer remains open')
  assert(await evaluate(`${q(preview)}.contains(document.activeElement)`), name + ': focus stays in viewer')
  assert.deepEqual(await evaluate(`[...document.querySelectorAll(${JSON.stringify(scroller)})].map(e=>e.scrollTop)`), before.scrolls, name + ': background cannot scroll')
  assert.deepEqual(await evaluate(`${q(preview)}.getBoundingClientRect().toJSON()`), before.rect, name + ': viewer stays fixed')
  metrics.push({ name, ...before })
  await screenshot(name)
  await key('Escape')
  await wait(`!${q(preview)}`)
  // Cerrado el visor, la conversación vuelve a responder a la rueda.
  const p = await evaluate(`(() => {const r=${q(prefix + ' ' + scroller)}.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+100)}})()`)
  const initial = await evaluate(`${q(prefix + ' ' + scroller)}.scrollTop`)
  await wheel(p.x, p.y, -1000)
  await wait(`${q(prefix + ' ' + scroller)}.scrollTop>${initial}`)
}

scenario(async () => {
  await useLocalModel({ capabilities: { vision: true } })
  const ids = []
  for (const title of ['Prueba visor de imagen', 'Panel vecino']) ids.push((await command('session_create', { chat: true, title })).session.id)
  await reload()
  await clickText('Prueba visor de imagen', 'aside button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  const png = await evaluate(`(() => {const c=document.createElement('canvas');c.width=900;c.height=500;const ctx=c.getContext('2d');const g=ctx.createLinearGradient(0,0,900,500);g.addColorStop(0,'#17314b');g.addColorStop(1,'#7556b8');ctx.fillStyle=g;ctx.fillRect(0,0,900,500);ctx.fillStyle='#fff';ctx.font='bold 54px sans-serif';ctx.fillText('Visor de imagen',80,180);ctx.font='28px sans-serif';ctx.fillText('La imagen permanece sobre toda la ventana',80,260);ctx.fillText('Escape o Cerrar para volver al chat',80,320);return c.toDataURL('image/png').split(',')[1]})()`)
  writeFileSync(join(ui.data, 'imagen.png'), Buffer.from(png, 'base64'))
  await attach('', 'imagen.png')
  await click('.composer-surface ' + historical)
  await wait(`${q(preview + ' img')}?.naturalWidth>0`)
  await screenshot('composer-centered')
  await key('Escape'); await wait(`!${q(preview)}`)
  for (let i = 1; i <= 4; i++) {
    await input('.composer-surface textarea', 'Turno ' + i + ' para construir un historial desplazable.')
    await click('.composer-surface button[aria-label="Enviar mensaje"]')
    await wait(`document.body.innerText.includes(${JSON.stringify('FIN DEL TURNO ' + i)})`)
    await wait(`!document.querySelector('button[aria-label="Detener generación"]')`)
  }
  await startOfChat()
  await click(historical)
  await verify('', 'normal-history')
  await startOfChat(); await click(historical)
  await click(preview + ' button[aria-label="Cerrar"]'); await wait(`!${q(preview)}`)
  await click(historical); await clickAt(25, 200); await wait(`!${q(preview)}`)

  await seedBoard({ boardId: 'image_acceptance', panes: panesFor(ids), focusedPaneId: 'pane_0' })
  const a = '[data-pane-id="pane_0"]'
  await startOfChat(a); await click(a + ' ' + historical)
  await verify(a, 'board-history')
  await startOfChat(a)
  await attach(a, 'imagen.png'); await click(a + ' .composer-surface ' + historical)
  await verify(a, 'board-composer')
  await attach(a, 'nota.txt')
  await evaluate(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(a + ' .composer-surface ' + historical)})].find(b=>b.textContent.includes("nota.txt"));b.focus();b.click()})()`)
  await wait(`${q(preview)}?.textContent.includes("Línea 150")`)
  const initial = await evaluate(`${q(a + ' ' + scroller)}.scrollTop`)
  const textPoint = await evaluate(`(()=>{const r=${q(preview + ' pre')}.getBoundingClientRect();return {x:Math.round(r.x+100),y:Math.round(r.y+100)}})()`)
  await wheel(textPoint.x, textPoint.y, -1000)
  await wait(`${q(preview + ' pre')}.parentElement.scrollTop>0`)
  assert.equal(await evaluate(`${q(a + ' ' + scroller)}.scrollTop`), initial)
  await screenshot('text-internal-scroll')
  await key('Escape'); await wait(`!${q(preview)}`)
  await size(1100, 720)
  await startOfChat(a); await click(a + ' ' + historical)
  await verify(a, 'board-short-window')
  await size(1500, 900)
  await click('.view-switcher button[aria-label="Normal"]')
  await startOfChat(); await click(historical)
  await wait(`${q(preview + ' img')}?.naturalWidth>0`)
  await screenshot('ready-for-review')
  report({ passed: ['real Engine image import and four turns', 'window-level portal and overlay', 'wheel and keyboard scroll blocked behind viewer', 'Escape, close button and backdrop', 'scroll resumes after dismissal', 'Normal and Boards history and composer', 'text attachment internal scroll', 'short window'], metrics })
})

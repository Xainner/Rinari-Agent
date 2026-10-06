// El ID de sesión del menú de la barra lateral cabe en una línea, completo,
// con clic derecho y con el botón de opciones, en español e inglés.
const { clipboard } = require('electron')
const assert = require('node:assert/strict')
const { ui, clickText, command, evaluate, language, q, reload, report, scenario, screenshot, size, useLocalModel, wait, click } = require('../harness.cjs')

const trigger = 'button[aria-label="Opciones de sesión"],button[aria-label="Session options"]'

async function open(title, dots) {
  await evaluate(`(() => {const b=[...document.querySelectorAll('aside button')].find(b=>b.textContent.includes(${JSON.stringify(title)}));const row=b.closest('li');row.dataset.menuTest='target';const t=row.querySelector(${JSON.stringify(trigger)});if(t)t.dataset.menuTrigger='true'})()`)
  await click(dots ? '[data-menu-test="target"] [data-menu-trigger]' : '[data-menu-test="target"]', dots ? 'left' : 'right')
  await wait(`Boolean(document.querySelector('[role="menu"]'))`)
}

const metrics = []
async function verify(id, title, name, dots = false) {
  await open(title, dots)
  const result = await evaluate(`(() => {const h=${q(`[role="menu"] [title="${id}"]`)},m=document.querySelector('[role="menu"]'),r=document.createRange();r.selectNodeContents(h);const rect=m.getBoundingClientRect();return {text:h.textContent,lines:r.getClientRects().length,full:h.scrollWidth<=h.clientWidth,left:rect.left,right:rect.right,width:rect.width,viewport:innerWidth}})()`)
  assert.equal(result.text, id)
  assert.equal(result.lines, 1, name + ': ID stays on one line')
  assert.equal(result.full, true, name + ': real session ID fits completely')
  assert(result.left >= 0 && result.right <= result.viewport, name + ': menu stays in viewport')
  metrics.push({ name, ...result })
  await screenshot(name)
}
async function choose(label) {
  await clickText(label, '[role=menuitem]')
  await wait(`!document.querySelector('[role="menu"]')`)
}

scenario(async () => {
  await size(1350, 850)
  await useLocalModel()
  const title = 'Prueba menú de conversación'
  const { session } = await command('session_create', { chat: true, title })
  await reload()
  // El renderer → preload → main validado es real; solo se captura la
  // escritura final para no reemplazar el portapapeles del equipo.
  const nativeWrite = clipboard.writeText
  const copies = []
  clipboard.writeText = (text) => { copies.push(text) }
  try {
    await verify(session.id, title, 'spanish-right-click')
    await choose('Copiar ID de sesión')
    assert.equal(copies.pop(), session.id)
    await verify(session.id, title, 'spanish-dots', true)
    await choose('Copiar referencia')
    assert(copies.pop().includes(session.id), 'Reference preserves complete ID')
    await language('en')
    await size(1100, 850)
    await verify(session.id, title, 'english-compact-window')
    await choose('Copy session ID')
    assert.equal(copies.pop(), session.id)
  } finally {
    clipboard.writeText = nativeWrite
  }
  await language('es')
  await size(1350, 850)
  if (ui.keep) await open(title, false)
  report({ passed: ['single-line complete Engine session ID', 'right-click and dots menu', 'full ID and reference copy through validated IPC', 'Spanish and English', 'compact desktop window bounds'], metrics })
})

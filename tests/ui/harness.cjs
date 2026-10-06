// Arnés común de las pruebas nativas de interfaz (`npm run ui:e2e`).
//
// Corre dentro de Electron: carga la app de producción (`dist-electron`) con
// un perfil aislado y ofrece las acciones que repetían todas las pruebas. El
// lanzador (`scripts/ui-e2e.mjs`) prepara el entorno y le pasa:
//
//   RINARI_UI_NAME    nombre del escenario
//   RINARI_UI_DATA    carpeta temporal del escenario (perfil, home, fixtures)
//   RINARI_UI_OUTPUT  carpeta de evidencias (capturas e informe)
//   RINARI_UI_MODEL   URL `/v1` del modelo falso en loopback, si el escenario lo pide
//   RINARI_UI_PHASE   fase actual (`exercise`, `restart`…)
//   RINARI_UI_KEEP    `1` deja la ventana abierta al terminar la última fase
//
// Los clics van por `sendInputEvent` (eventos de confianza, como un ratón
// real) salvo donde una prueba pide expresamente un `click()` del DOM.
const { app, BrowserWindow, Menu, screen } = require('electron')
const { join } = require('node:path')
const { writeFileSync } = require('node:fs')

const name = process.env.RINARI_UI_NAME
const data = process.env.RINARI_UI_DATA
const output = process.env.RINARI_UI_OUTPUT
if (!name || !data || !output) throw new Error('Arranca las pruebas con `npm run ui:e2e -- <escenario>`.')
app.setPath('userData', join(data, 'profile'))
require('../../dist-electron/main.cjs')

/** Proveedor local sin credenciales que nunca contesta: el turno falla. */
const DEAD_MODEL = 'http://127.0.0.1:9/v1'
const BOARD_SCHEMA = 4

const ui = {
  name,
  data,
  output,
  phase: process.env.RINARI_UI_PHASE || 'exercise',
  model: process.env.RINARI_UI_MODEL || DEAD_MODEL,
  keep: process.env.RINARI_UI_KEEP === '1',
  /** @type {import('electron').BrowserWindow} */
  win: null,
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const evaluate = (code) => ui.win.webContents.executeJavaScript(code)
/** Expresión JS que devuelve el primer elemento del selector. */
const q = (selector) => `document.querySelector(${JSON.stringify(selector)})`

async function until(check, label, timeout = 30_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await check()) return
    await delay(100)
  }
  throw new Error('Timed out: ' + label)
}
/** Espera a que una expresión del renderer sea verdadera. */
const wait = (code, timeout) => until(() => evaluate(code), code, timeout)

async function center(selector) {
  return evaluate(`(() => {const r=${q(selector)}.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`)
}
async function clickAt(x, y, button = 'left') {
  ui.win.focus()
  ui.win.webContents.sendInputEvent({ type: 'mouseMove', x, y })
  ui.win.webContents.sendInputEvent({ type: 'mouseDown', button, clickCount: 1, x, y })
  ui.win.webContents.sendInputEvent({ type: 'mouseUp', button, clickCount: 1, x, y })
  await delay(250)
}
/** Clic de ratón real en el centro del elemento, tras traerlo a la vista. */
async function click(selector, button = 'left') {
  await wait(`Boolean(${q(selector)}) && !${q(selector)}.disabled`)
  await evaluate(`${q(selector)}.scrollIntoView({behavior:'instant',block:'nearest',inline:'nearest'})`)
  await delay(150)
  const point = await center(selector)
  await clickAt(point.x, point.y, button)
}
/** `click()` del DOM: para menús y filas cuya posición no se prueba. */
async function domClick(selector) {
  await wait(`Boolean(${q(selector)})`)
  await evaluate(`${q(selector)}.click()`)
  await delay(200)
}
/** `click()` del DOM sobre el elemento de `scope` cuyo texto es exactamente `text`. */
async function clickText(text, scope = 'button', { includes = false } = {}) {
  const match = includes ? `b.textContent.includes(${JSON.stringify(text)})` : `b.textContent.trim()===${JSON.stringify(text)}`
  await wait(`[...document.querySelectorAll(${JSON.stringify(scope)})].some(b=>${match})`)
  await evaluate(`[...document.querySelectorAll(${JSON.stringify(scope)})].find(b=>${match}).click()`)
  await delay(200)
}
async function key(keyCode, modifiers = []) {
  ui.win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
  ui.win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
  await delay(150)
}
/**
 * Atajo del menú nativo (p. ej. Ctrl+W). Windows solo entrega los
 * aceleradores a la ventana con el foco del sistema, que una prueba en segundo
 * plano no tiene garantizado: se comprueba la tecla del ítem y se activa ese
 * mismo ítem, que recorre el camino real menú → renderer.
 */
async function menuShortcut(id, accelerator) {
  const item = Menu.getApplicationMenu()?.getMenuItemById(id)
  if (!item) throw new Error(`No menu item ${id}`)
  if (item.accelerator !== accelerator) throw new Error(`Menu item ${id} is bound to ${item.accelerator}, expected ${accelerator}`)
  item.click(undefined, ui.win, ui.win.webContents)
  await delay(250)
}
async function wheel(x, y, deltaY) {
  ui.win.webContents.sendInputEvent({ type: 'mouseMove', x, y })
  ui.win.webContents.sendInputEvent({ type: 'mouseWheel', x, y, deltaX: 0, deltaY, canScroll: true })
  await delay(100)
}
/** Escribe en un textarea o input como lo haría React al teclear. */
async function input(selector, value) {
  await wait(`Boolean(${q(selector)})`)
  await evaluate(`(() => {const el=${q(selector)};const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  await delay(250)
}

/** Comando del Engine por el mismo IPC validado que usa la app. */
function command(commandName, args = {}) {
  const payload = commandName === 'session_create' ? { mode: 'build', permission_profile: 'workspace', ...args } : args
  return evaluate(`window.rinariDesktop.command(${JSON.stringify(commandName)},${JSON.stringify(payload)})`)
}
const stored = (storageKey) => evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)}) || '{}')`)

/** Captura de la ventana; reintenta si el compositor aún no tiene un fotograma. */
async function screenshot(shot) {
  for (let attempt = 1; ; attempt++) {
    await delay(attempt === 1 ? 150 : 500)
    try {
      writeFileSync(join(output, shot + '.png'), (await ui.win.webContents.capturePage()).toPNG())
      return
    } catch (error) {
      if (attempt === 5) throw error
    }
  }
}

/** Engine listo, interfaz montada y onboarding descartado. */
async function ready() {
  await wait('Boolean(window.rinariDesktop)')
  await wait('(async () => (await window.rinariDesktop.engine.status()).state === "ready")()', 60_000)
  await wait('Boolean(document.querySelector(".view-switcher"))')
  await delay(400)
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Configurar después')?.click()`)
  await evaluate('document.fonts.ready')
}
async function reload() {
  ui.win.webContents.reload()
  await ready()
}
async function size(width, height) {
  // Una ventana no crece más que la pantalla: falla aquí, con la causa, y no
  // después con un desbordamiento que no lo parece.
  const area = screen.getDisplayMatching(ui.win.getBounds()).workAreaSize
  const frame = ui.win.getSize()[0] - ui.win.getContentSize()[0]
  if (width + frame > area.width || height > area.height) {
    throw new Error(`The screen work area is ${area.width}x${area.height}; this scenario needs a ${width}x${height} window.`)
  }
  if (ui.win.isMaximized()) { ui.win.unmaximize(); await delay(400) }
  ui.win.setMinimumSize(480, 500)
  ui.win.setContentSize(width, height)
  await wait(`Math.abs(innerWidth - ${width}) <= 2`)
  await delay(300)
}
/** Idioma de la interfaz; recarga para aplicarlo. */
async function language(lang) {
  await evaluate(`localStorage.setItem('rinari.lang',${JSON.stringify(lang)})`)
  await reload()
}

/** Registra el modelo local del escenario como modelo activo. */
async function useLocalModel({ capabilities } = {}) {
  await command('provider_create', { alias: 'prueba-local', provider_type: 'custom', auth_method: 'none', endpoint: ui.model })
  await command('model_add', { provider: 'prueba-local', provider_model_id: 'fake-vertical', alias: 'prueba-local', ...(capabilities ? { capabilities } : {}) })
  await command('model_use', { reference: 'prueba-local' })
}

/**
 * Siembra un layout de Boards y abre la vista. Es un fixture: congela
 * `rinari.board.v1` para que el volcado al descargar la página no lo pise.
 */
async function seedBoard(layout, { open = true } = {}) {
  const value = { version: BOARD_SCHEMA, focusMode: false, focusModeSnapshot: null, ...layout }
  await evaluate(`(() => {
    const write=Storage.prototype.setItem;
    write.call(localStorage,'rinari.board.v1',${JSON.stringify(JSON.stringify(value))});
    Storage.prototype.setItem=function(key,value){if(key!=='rinari.board.v1')write.call(this,key,value)};
  })()`)
  await reload()
  if (!open) return
  await click('.view-switcher button[aria-label^="Boards"]')
  await wait(`document.querySelectorAll('[data-pane-id]').length===${value.panes.length}`)
}
/** Paneles expandidos para estas sesiones, enfocando el primero. */
function panesFor(ids, width = 550) {
  return ids.map((sessionId, i) => ({ paneId: 'pane_' + i, sessionId, width, collapsed: false }))
}

function report(content) {
  writeFileSync(join(output, `report${ui.phase === 'exercise' ? '' : '-' + ui.phase}.json`), JSON.stringify({ scenario: name, phase: ui.phase, ...content, data }, null, 2))
}

/**
 * Ejecuta el escenario: abre la ventana, corre `body(ui)` y cierra. Ante un
 * fallo guarda `failure.png` y el final del texto visible.
 */
function scenario(body, { width = 1500, height = 900, timeout = 300_000 } = {}) {
  const timer = setTimeout(() => {
    console.error(`${name}: timed out after ${timeout / 1000} s`)
    app.exit(1)
  }, timeout)
  const run = async () => {
    await app.whenReady()
    while (!(ui.win = BrowserWindow.getAllWindows()[0])) await delay(50)
    // Una ventana tapada por otras pausa requestAnimationFrame y las medidas
    // que dependen de él. Solo en la prueba: la app conserva su política.
    ui.win.webContents.setBackgroundThrottling(false)
    await ready()
    await size(width, height)
    await body(ui)
  }
  run().then(async () => {
    clearTimeout(timer)
    console.log(`RINARI_UI_OK ${name} ${ui.phase}`)
    if (ui.keep && process.env.RINARI_UI_LAST_PHASE === '1') {
      ui.win.setTitle(`Rinari Agent — prueba ${name}`)
      ui.win.show(); ui.win.focus()
      return
    }
    await evaluate('window.rinariDesktop.engine.shutdown()').catch(() => {})
    app.exit(0)
  }).catch(async (error) => {
    clearTimeout(timer)
    console.error(error)
    if (ui.win && !ui.win.isDestroyed()) {
      console.error((await evaluate('document.body.innerText').catch(() => '')).slice(-3000))
      await screenshot('failure').catch(() => {})
      await evaluate('window.rinariDesktop.engine.shutdown()').catch(() => {})
    }
    app.exit(1)
  })
}

module.exports = {
  ui, delay, evaluate, q, until, wait, center, clickAt, click, domClick, clickText, key, menuShortcut, wheel, input,
  command, stored, screenshot, ready, reload, size, language, useLocalModel, seedBoard, panesFor,
  report, scenario, DEAD_MODEL,
}

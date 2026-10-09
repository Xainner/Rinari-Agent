// El panel lateral de un panel de Boards empieza cerrado para sesiones sin
// preferencias, respeta el layout guardado de cada sesión y sobrevive a un
// reinicio completo. Los textos dicen «panel lateral» en español e inglés.
const assert = require('node:assert/strict')
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { ui, click, clickText, command, evaluate, input, key, reload, report, scenario, screenshot, useLocalModel, wait, delay } = require('../harness.cjs')

const layouts = () => evaluate(`JSON.parse(localStorage.getItem('rinari.sessionDock.v1') || '{}')`)
const board = () => evaluate(`JSON.parse(localStorage.getItem('rinari.board.v1') || '{}')`)
async function layout(id) { return Object.entries(await layouts()).find(([storageKey]) => storageKey.endsWith('::' + id))?.[1] }
async function pane(id) { return `[data-pane-id="${(await board()).panes.find((p) => p.sessionId === id).paneId}"]` }
async function state(id, visible) {
  const p = await pane(id)
  await wait(`document.querySelector(${JSON.stringify(p + ' .session-workspace')})?.dataset.dock ${visible ? '!==' : '==='} 'hidden'`)
  assert.equal((await layout(id)).visible, visible)
  assert.equal(await evaluate(`Boolean(document.querySelector(${JSON.stringify(p + ' [data-testid="session-dock"]')}))`), visible)
}
async function add(title) {
  const count = await evaluate('document.querySelectorAll(".session-pane[data-pane-id]").length')
  await click(count ? '.board-toolbar .is-primary' : '.board-empty-primary')
  await wait(`Boolean(document.querySelector('[role="dialog"] .add-pane-row'))`)
  await clickText(title, '[role="dialog"] .add-pane-row', { includes: true })
  await wait(`document.querySelectorAll('.session-pane[data-pane-id]').length===${count + 1}`)
  await wait(`JSON.parse(localStorage.getItem('rinari.board.v1') || '{}').panes?.length===${count + 1}`)
  await delay(300)
  return (await board()).panes.at(-1).sessionId
}
const toggle = 'button[aria-label="Mostrar u ocultar panel lateral"]'
/** «Chat general» deja un panel borrador; su primer mensaje crea la sesión. */
async function addGeneralChat() {
  await add('Chat general')
  const draftPane = (await board()).panes.at(-1).paneId
  await input(`[data-pane-id="${draftPane}"] .composer-surface textarea`, 'Hola')
  await click(`[data-pane-id="${draftPane}"] .composer-surface button[aria-label="Enviar mensaje"]`)
  await wait(`JSON.parse(localStorage.getItem('rinari.board.v1') || '{}').panes?.find(p=>p.paneId===${JSON.stringify(draftPane)})?.sessionId`)
  return (await board()).panes.find((p) => p.paneId === draftPane).sessionId
}

async function exercise() {
  const passed = []
  await useLocalModel()
  const { session: a } = await command('session_create', { chat: true, title: 'Sin preferencias' })
  const { session: saved } = await command('session_create', { chat: true, title: 'Lateral guardado' })
  await reload()
  await clickText('Lateral guardado')
  await click('button[aria-label="Panel lateral"]')
  await clickText('Tareas', '[role="tab"]')
  const kept = await layout(saved.id)
  assert.equal(kept.visible, true)
  assert.equal(kept.workspaceTab, 'tasks')
  await click('.view-switcher button[aria-label^="Boards"]')
  await add('Sin preferencias'); await state(a.id, false)
  assert.equal(await evaluate('document.querySelectorAll("[data-testid=session-dock]").length'), 0)
  const fresh = await addGeneralChat(); await state(fresh, false)
  await state(a.id, false)
  passed.push('Existing session without preferences and newly created session both start closed')
  await screenshot('new-panels-closed')
  await add('Lateral guardado'); await state(saved.id, true)
  assert.deepEqual(await layout(saved.id), kept)
  const pa = await pane(a.id)
  await click(pa + ' .pane-header-title')
  await delay(400)
  await click(pa + ' ' + toggle); await state(a.id, true)
  await state(fresh, false)
  assert.deepEqual(await layout(saved.id), kept)
  const close = pa + ' button[aria-label="Cerrar panel lateral"]'
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(close)}).title`), 'Cerrar panel lateral')
  await click(close); await state(a.id, false)
  assert.equal((await board()).panes.length, 3)
  assert.equal((await command('session_get', { reference: a.id })).session.state, 'active')
  await click('button[aria-label="Panel lateral"]'); await state(a.id, true)
  passed.push('Header and topbar target the focused session; closing keeps the conversation and other layouts')
  await click(pa + ' button[aria-label="Opciones del panel"]')
  await clickText('Quitar del board', '[role="menuitem"]')
  await add('Sin preferencias'); await state(a.id, true)
  assert.equal((await board()).panes.length, 3)
  passed.push('Normal preference and Workspace tab survive Boards; removal/re-add preserves open layout')
  await click((await pane(a.id)) + ' button[aria-label="Cerrar panel lateral"]')
  // Fixture de un panel manual estrecho: congela el board para que el
  // volcado al recargar no pise el ancho. No toca las preferencias probadas.
  await evaluate(`(() => {
    const value=JSON.parse(localStorage.getItem('rinari.board.v1'));
    value.panes.find(p=>p.sessionId===${JSON.stringify(a.id)}).width=480;
    const write=Storage.prototype.setItem;
    write.call(localStorage,'rinari.board.v1',JSON.stringify(value));
    Storage.prototype.setItem=function(key,value){if(key!=='rinari.board.v1')write.call(this,key,value)};
  })()`)
  await reload()
  await click('.view-switcher button[aria-label^="Boards"]')
  await state(a.id, false)
  const narrow = await pane(a.id)
  await click(narrow + ' ' + toggle); await state(a.id, true)
  await wait(`document.querySelector(${JSON.stringify(narrow + ' [data-testid="session-dock"]')})?.dataset.layout==='drawer'`)
  // The drawer takes focus once it has laid out, a frame after `data-layout` changes.
  await wait(`document.querySelector(${JSON.stringify(narrow + ' [data-testid="session-dock"]')}).contains(document.activeElement)`)
  await key('Escape')
  await state(a.id, false)
  passed.push('Narrow closed pane has no drawer; explicit opening creates a focused drawer and Escape closes it')
  await evaluate(`localStorage.setItem('rinari.lang','en')`)
  await reload()
  await click('.view-switcher button[aria-label^="Boards"]')
  const english = await pane(a.id)
  await click(english + ' button[aria-label="Show or hide side panel"]')
  await state(a.id, true)
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(english + ' button[aria-label="Close side panel"]')}).title`), 'Close side panel')
  assert(await evaluate(`Boolean(document.querySelector(${JSON.stringify(english + ' [aria-label="Session side panel"]')}))`))
  await screenshot('english-side-panel')
  await click(english + ' button[aria-label="Close side panel"]')
  await state(a.id, false)
  await evaluate(`localStorage.setItem('rinari.lang','es')`)
  passed.push('Spanish and English controls use consistent tooltip and accessible side-panel names')
  const ids = [a.id, fresh, saved.id]
  const visibility = { [a.id]: false, [fresh]: false, [saved.id]: true }
  writeFileSync(join(ui.data, 'expected.json'), JSON.stringify({ layouts: await layouts(), ids, visibility }, null, 2))
  report({ passed })
}

async function restart() {
  const saved = JSON.parse(readFileSync(join(ui.data, 'expected.json'), 'utf8'))
  assert.deepEqual(await layouts(), saved.layouts, 'Side panel layouts survive a complete process restart')
  await click('.view-switcher button[aria-label^="Boards"]')
  for (const id of saved.ids) await state(id, saved.visibility[id])
  const fresh = await addGeneralChat()
  await state(fresh, false)
  await screenshot('restart-new-closed')
  report({ passed: ['old preferences restored after restart', 'new session still starts closed'] })
}

scenario(ui.phase === 'restart' ? restart : exercise, { width: 1500, height: 880 })

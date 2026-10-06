// «Quitar todos» vacía el board tras confirmar con el diálogo de la app, con
// paneles expandidos, colapsados y en modo foco. Conserva conversaciones,
// borradores, paneles laterales y el turno en curso; tras reiniciar la app y
// el Engine el board sigue vacío y las sesiones activas.
const assert = require('node:assert/strict')
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { ui, click, clickText, command, evaluate, input, report, scenario, screenshot, seedBoard, size, stored, until, useLocalModel, wait, delay } = require('../harness.cjs')

const origin = () => ui.model.replace(/\/v1$/, '')

function layout(ids, mode = 'expanded') {
  return {
    boardId: 'remove_all_acceptance',
    panes: ids.map((sessionId, i) => ({ paneId: `pane_${i}`, sessionId, width: 700, collapsed: mode === 'collapsed' || (mode === 'focus' && i !== 1) })),
    focusedPaneId: mode === 'collapsed' ? null : 'pane_1',
    focusMode: mode === 'focus',
    focusModeSnapshot: mode === 'focus' ? { pane_0: false, pane_1: false, pane_2: false } : null,
  }
}

async function removeAll(label = 'Quitar todos') {
  await click(`.board-toolbar button[aria-label="${label}"]`)
  // La confirmación es el diálogo de la app; su botón repite la etiqueta.
  await wait(`Boolean(document.querySelector('[role="alertdialog"]'))`)
  await clickText(label, '[role="alertdialog"] button')
  await wait('document.querySelectorAll("[data-pane-id]").length===0 && Boolean(document.querySelector(".board-empty"))')
  await wait(`JSON.parse(localStorage.getItem('rinari.board.v1')).panes.length===0`)
  const board = await stored('rinari.board.v1')
  assert.equal(board.focusedPaneId, null)
  assert.equal(board.lastExpandedPaneId, null)
  assert.equal(board.focusMode, false)
  assert.equal(board.focusModeSnapshot, null)
}

async function exercise() {
  await size(1500, 880)
  await useLocalModel()
  const ids = []
  for (let i = 1; i <= 3; i++) ids.push((await command('session_create', { chat: true, title: `Prueba quitar ${i}` })).session.id)
  await seedBoard(layout(ids))
  await input('[data-pane-id="pane_0"] textarea', 'Borrador que debe conservarse')
  await click('[data-pane-id="pane_0"] .pane-header-title')
  await click('[data-pane-id="pane_0"] button[aria-label="Mostrar u ocultar panel lateral"]')
  const docks = await stored('rinari.sessionDock.v1')
  await input('[data-pane-id="pane_1"] textarea', 'Turno local controlado para comprobar que sigue vivo')
  await click('[data-pane-id="pane_1"] .pane-header-title')
  await click('[data-pane-id="pane_1"] button[aria-label="Enviar mensaje"]')
  await until(async () => (await (await fetch(origin() + '/__pending')).json()) === true, 'real Engine reaches held model request')
  await wait(`document.querySelector('[data-pane-id="pane_1"]').dataset.status === "working"`)
  const draft = await stored('rinari.composer.drafts.v1')
  await screenshot('running-before-removal')

  // Cancelar el diálogo no toca el board.
  await click('.board-toolbar button[aria-label="Quitar todos"]')
  await clickText('Cancelar', '[role="alertdialog"] button')
  await wait(`!document.querySelector('[role="alertdialog"]')`)
  assert.equal(await evaluate('document.querySelectorAll("[data-pane-id]").length'), 3)
  await click('.board-toolbar button[aria-label="Quitar todos"]')
  await wait(`Boolean(document.querySelector('[role="alertdialog"]'))`)
  await screenshot('confirmation')
  await clickText('Cancelar', '[role="alertdialog"] button')

  await removeAll()
  assert.deepEqual(await stored('rinari.sessionDock.v1'), docks)
  assert.deepEqual(await stored('rinari.composer.drafts.v1'), draft)
  const release = await (await fetch(origin() + '/__release')).json()
  assert.equal(release.wasConnected, true, 'Removal must not cancel the in-flight provider request')
  await until(async () => JSON.stringify(await command('session_history', { reference: ids[1] })).includes('El turno terminó después de quitar los paneles.'), 'turn completes after removal')
  for (const id of ids) assert.equal((await command('session_get', { reference: id })).session.state, 'active')
  await screenshot('empty-conversations-preserved')
  await seedBoard(layout(ids, 'collapsed')); await removeAll()
  await seedBoard(layout(ids, 'focus')); await removeAll()

  await evaluate(`localStorage.setItem('rinari.lang','en')`)
  await seedBoard(layout(ids))
  await size(780, 800)
  const button = '.board-toolbar button[aria-label="Remove all"]'
  assert(await evaluate(`(() => {const b=document.querySelector(${JSON.stringify(button)});const r=b.getBoundingClientRect();return r.width>0 && r.left>=0 && r.right<=innerWidth && b.title.includes('Conversations')})()`))
  await screenshot('narrow-english')
  await removeAll('Remove all')
  await evaluate(`localStorage.setItem('rinari.lang','es')`)
  writeFileSync(join(ui.data, 'expected.json'), JSON.stringify({ ids }))
  report({ passed: ['app-styled confirmation, cancel keeps the board', 'expanded panes', 'collapsed panes', 'focus mode', 'draft and side panel preservation', 'real Engine turn completes after removal with scripted model', 'sessions remain active', 'English accessible control at 780px'] })
}

async function restart() {
  await size(1500, 880)
  const { ids } = JSON.parse(readFileSync(join(ui.data, 'expected.json'), 'utf8'))
  assert.equal((await stored('rinari.board.v1')).panes.length, 0)
  await click('.view-switcher button[aria-label^="Boards"]')
  await wait('Boolean(document.querySelector(".board-empty"))')
  for (const id of ids) assert.equal((await command('session_get', { reference: id })).session.state, 'active')
  // Deja un board poblado para revisar el botón a mano con --keep.
  for (let i = 0; i < ids.length; i++) {
    await click(i ? '.board-toolbar .is-primary' : '.board-empty-primary')
    await wait(`Boolean(document.querySelector('[role="dialog"] .add-pane-row'))`)
    await clickText(`Prueba quitar ${i + 1}`, '[role="dialog"] .add-pane-row', { includes: true })
    await wait(`document.querySelectorAll('[data-pane-id]').length===${i + 1}`)
    await wait(`!document.querySelector('[role="dialog"]')`)
  }
  await delay(400)
  await screenshot('ready-for-review')
  report({ passed: ['board stays empty after restarting the app and the Engine', 'all conversations remain active', 'panes can be added back'] })
}

scenario(ui.phase === 'restart' ? restart : exercise, { width: 1500, height: 880 })

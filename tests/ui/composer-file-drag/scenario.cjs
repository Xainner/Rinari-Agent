// Arrastrar archivos resalta toda el área del chat (no solo el composer),
// adjunta por el flujo normal y, en Boards, solo en el panel de destino.
// Chromium genera eventos de arrastre de confianza con archivos reales de disco.
const assert = require('node:assert/strict')
const { join } = require('node:path')
const { ui, click, command, evaluate, input, key, panesFor, q, reload, report, scenario, screenshot, seedBoard, useLocalModel, wait, delay } = require('../harness.cjs')

async function point(selector) {
  return evaluate(`(() => {const r=${q(selector)}.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
}
async function drag(type, selector, files = ['adjunto.txt']) {
  await ui.win.webContents.debugger.sendCommand('Input.dispatchDragEvent', {
    type, ...await point(selector),
    data: { items: [], files: files.map((file) => join(ui.data, file)), dragOperationsMask: 1 },
  })
  await delay(100)
}
const cue = '.chat-file-drop-zone[data-file-drag]'
const area = '.chat-file-drop-zone'
const surface = '.composer-surface'
const rect = (selector) => evaluate(`${q(selector)}.getBoundingClientRect().toJSON()`)

scenario(async () => {
  ui.win.webContents.debugger.attach('1.3')
  try {
    await useLocalModel()
    await reload()
    await delay(700)
    await wait(`Boolean(${q(surface)})`)
    const before = await rect(surface)
    await evaluate(`window.dragTrace=[];for(const type of ['dragenter','dragover','dragleave','drop'])document.addEventListener(type,e=>window.dragTrace.push({type,trusted:e.isTrusted,types:[...e.dataTransfer.types],files:e.dataTransfer.files.length,dropEffect:e.dataTransfer.dropEffect}),false)`)
    await drag('dragEnter', area)
    await drag('dragOver', '.home-greeting')
    await wait(`Boolean(${q(cue)})`)
    assert.deepEqual(await rect(surface), before)
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".chat-file-drop-overlay")).pointerEvents'), 'none')
    assert.deepEqual(await rect('.chat-file-drop-overlay'), await rect(area))
    await screenshot('centered-hover')
    await drag('dragCancel', surface)
    // CDP dragCancel no siempre emite dragleave: también se prueba Escape.
    await key('Escape')
    await wait('!document.querySelector(".chat-file-drop-overlay")')
    await drag('dragEnter', area)
    await drag('dragOver', area)
    await drag('drop', area)
    await wait('!document.querySelector(".chat-file-drop-overlay")')
    await wait(`${q(surface)}.textContent.includes('adjunto.txt') && !${q(surface + ' .animate-spin')}`)
    await screenshot('text-prepared')
    await input(surface + ' textarea', 'Revisa el archivo adjunto de prueba.')
    await click(surface + ' button[aria-label="Enviar mensaje"]')
    await wait(`document.body.innerText.includes('Adjunto recibido en el turno de prueba.')`)
    await screenshot('sent-through-engine')
    await drag('dragEnter', '.conversation-transcript', ['imagen.png'])
    await drag('dragOver', '.conversation-transcript', ['imagen.png'])
    await screenshot('full-chat-hover')
    await drag('dragOver', surface + ' textarea', ['imagen.png'])
    await wait(`Boolean(${q(cue)})`)
    await screenshot('bottom-hover')
    await drag('drop', surface, ['imagen.png'])
    await wait(`${q(surface)}.textContent.includes('imagen.png') && !${q(surface + ' .animate-spin')}`)
    assert.equal(await evaluate(`Boolean(${q(surface + ' img')})`), true)
    await screenshot('image-prepared')
    const trace = await evaluate('window.dragTrace')

    const ids = []
    for (const title of ['Adjuntos A', 'Adjuntos B']) ids.push((await command('session_create', { chat: true, title })).session.id)
    await seedBoard({ boardId: 'file_drag_acceptance', panes: panesFor(ids), focusedPaneId: 'pane_0' })
    const a = '[data-pane-id="pane_0"] .chat-file-drop-zone'
    const b = '[data-pane-id="pane_1"] .chat-file-drop-zone'
    await drag('dragEnter', a)
    await drag('dragOver', a)
    await drag('dragOver', b)
    await wait(`Boolean(${q(b + '[data-file-drag]')}) && !${q(a + '[data-file-drag]')}`)
    await screenshot('boards-target-b')
    await drag('drop', b)
    await wait(`${q(b)}.textContent.includes('adjunto.txt') && !${q(b + ' .animate-spin')}`)
    assert.equal(await evaluate(`${q(a)}.textContent.includes('adjunto.txt')`), false)
    assert.equal(await evaluate(`JSON.parse(localStorage.getItem('rinari.board.v1')).focusedPaneId`), 'pane_0')
    await screenshot('boards-attached-only-b')
    assert(trace.some((e) => e.type === 'dragover' && e.trusted && e.types.includes('Files') && e.files === 0 && e.dropEffect === 'copy'))
    assert(trace.some((e) => e.type === 'drop' && e.trusted && e.files === 1))
    report({ passed: ['trusted protected file drag', 'copy drop effect', 'stable geometry', 'cancel cleanup', 'text preparation and complete real Engine turn with scripted model', 'image preparation', 'centered and bottom composer', 'Boards unfocused destination'], trace })
  } finally {
    ui.win.webContents.debugger.detach()
  }
})

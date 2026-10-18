// Boards (plan-boards B.4): Ctrl+1…9 va al panel N (con el cursor en su
// composer; plegado, con su vistazo y sin desplegarlo), Ctrl+J dice «Nada te
// necesita» cuando nada te necesita, una conversación de la barra lateral se
// suelta entre dos paneles con una guía, y la barra deja a la vista solo los
// contadores, «Ajustar a la vista» y «Añadir panel», sin la columna fija.
const assert = require('node:assert/strict')
const { ui, command, delay, evaluate, report, scenario, screenshot, seedBoard, size, useLocalModel, wait } = require('../harness.cjs')

function press(keyCode, modifiers = ['control']) {
  ui.win.focus()
  ui.win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
  ui.win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
}

scenario(async () => {
  await size(1600, 860)
  await useLocalModel()
  const ids = []
  for (const title of ['Uno', 'Dos', 'Tres', 'Cuatro']) ids.push((await command('session_create', { chat: true, title })).session.id)
  await seedBoard({
    boardId: 'shortcuts',
    fitToView: true,
    panes: [
      { paneId: 'pane_0', sessionId: ids[0], width: 600, collapsed: false },
      { paneId: 'pane_1', sessionId: ids[1], width: 600, collapsed: false },
      { paneId: 'pane_2', sessionId: ids[2], width: 600, collapsed: true },
    ],
    focusedPaneId: 'pane_0',
  })

  // The bar: counters, «Ajustar a la vista», «⋯» and «Añadir panel»; no fixed column.
  const buttons = await evaluate(`[...document.querySelectorAll('.board-toolbar button')].map(b => b.getAttribute('aria-label') || b.textContent.trim())`)
  assert.deepEqual(buttons, ['Ajustar a la vista', 'Más acciones del board', 'Añadir panel'])
  assert.equal(await evaluate(`Boolean(document.querySelector('.board-add-column'))`), false)
  const toolbarHeight = await evaluate(`document.querySelector('.board-toolbar').getBoundingClientRect().height`)

  // Ctrl+2: pane 2 focused, the cursor in its composer.
  press('2')
  await wait(`document.querySelector('[data-pane-id="pane_1"]')?.dataset.focused === 'true'`)
  await wait(`document.activeElement === document.querySelector('[data-pane-id="pane_1"] .composer-surface textarea')`)

  // Ctrl+3 on a collapsed pane: focused, its peek open, still collapsed.
  press('3')
  await wait(`Boolean(document.querySelector('[data-testid="pane-peek"]'))`)
  assert.equal(await evaluate(`document.querySelector('[data-pane-id="pane_2"]').dataset.collapsed`), 'true')
  await wait(`document.querySelector('[data-pane-id="pane_2"]').contains(document.activeElement)`)
  await screenshot('ctrl-3-peek')
  press('Escape', [])
  await wait(`!document.querySelector('[data-testid="pane-peek"]')`)

  // Ctrl+J with nothing that needs you.
  press('J')
  await wait(`document.body.innerText.includes('Nada te necesita')`)
  assert.equal(await evaluate(`document.querySelector('.board-toolbar').getBoundingClientRect().height`), toolbarHeight, 'the bar keeps its height')

  // Drag «Cuatro» from the sidebar between pane 1 and pane 2: a guide, then the pane there.
  const dropped = await evaluate(`(() => {
    const row = [...document.querySelectorAll('aside li button')].find(b => b.textContent.includes('Cuatro'))
    const data = new DataTransfer()
    row.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: data }))
    const canvas = document.querySelector('.board-canvas')
    const second = document.querySelector('[data-pane-id="pane_1"]').getBoundingClientRect()
    const x = second.left + 20
    canvas.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: x, clientY: 300, dataTransfer: data }))
    return { types: [...data.types], x }
  })()`)
  assert(dropped.types.includes('application/x-rinari-session'), 'the sidebar row carries the conversation: ' + dropped.types.join(','))
  await wait(`Boolean(document.querySelector('[data-testid="board-drop-guide"]'))`)
  await screenshot('drop-guide')
  await evaluate(`(() => {
    const data = new DataTransfer()
    data.setData('application/x-rinari-session', ${JSON.stringify(ids[3])})
    document.querySelector('.board-canvas').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: ${dropped.x}, clientY: 300, dataTransfer: data }))
  })()`)
  await wait(`document.querySelectorAll('.board-pane-row > [data-pane-id]').length === 4`)
  const order = await evaluate(`[...document.querySelectorAll('.board-pane-row > [data-pane-id]')].map(p => p.getAttribute('aria-label'))`)
  assert.deepEqual(order, ['Uno', 'Cuatro', 'Dos', 'Tres'])
  assert.equal(await evaluate(`Boolean(document.querySelector('[data-testid="board-drop-guide"]'))`), false)
  await delay(200)
  await screenshot('dropped')
  report({ passed: ['bar with counters, fit, menu and add only', 'Ctrl+2 focuses the composer', 'Ctrl+3 peeks a collapsed pane', 'Ctrl+J says nothing needs you', 'drop from the sidebar between panes'] })
})

// Boards (plan-boards B.2): un panel plegado que trabaja es una columna de
// ~200 px que se actualiza con los eventos (la lista de pasos, el paso en
// curso, el fin con su resultado) sin desplegarse ni montar el chat. El
// vistazo al pasar el ratón trae la última respuesta. En una ventana angosta,
// donde la columna no cabe, el panel cae a la tira de 48 px.
const assert = require('node:assert/strict')
const { ui, command, evaluate, report, scenario, screenshot, seedBoard, size, until, useLocalModel, wait, delay } = require('../harness.cjs')

const lane = (path) => fetch(new URL(`${path}?lane=main`, ui.model)).then((r) => r.json())
async function step(label) {
  await until(async () => await lane('/__pending') > 0, label)
  assert.equal(await lane('/__release'), true)
}
const column = '[data-pane-id="pane_1"]'
const text = (selector) => evaluate(`document.querySelector('${selector}')?.innerText ?? ''`)

scenario(async () => {
  await size(1500, 850)
  await useLocalModel()
  const ids = []
  for (const title of ['Panel abierto', 'Migrar pagos']) ids.push((await command('session_create', { chat: true, title })).session.id)
  await seedBoard({
    boardId: 'collapsed_live',
    fitToView: true,
    panes: [
      { paneId: 'pane_0', sessionId: ids[0], width: 700, collapsed: false },
      { paneId: 'pane_1', sessionId: ids[1], width: 700, collapsed: true },
    ],
    focusedPaneId: 'pane_0',
  })
  await wait(`document.querySelector('${column}')?.dataset.variant === 'column'`)
  const width = await evaluate(`Math.round(document.querySelector('${column}').getBoundingClientRect().width)`)
  assert(Math.abs(width - 200) <= 2, 'the collapsed pane is a ~200 px column: ' + width)

  await command('turn_start', { session_id: ids[1], message: 'Migra los pagos a la versión nueva' })
  await step('first checklist')
  await wait(`(document.querySelector('${column} [data-testid="pane-column-steps"]')?.innerText ?? '').includes('0/3')`)
  assert((await text(`${column} [data-testid="pane-column-steps"]`)).includes('Reunir los datos'))
  await step('second checklist')
  await wait(`(document.querySelector('${column} [data-testid="pane-column-steps"]')?.innerText ?? '').includes('1/3')`)
  assert((await text(`${column} [data-testid="pane-column-steps"]`)).includes('Escribiendo el informe · Paso 2 de 3'))
  // Nothing of the conversation is mounted while it stays collapsed.
  assert.equal(await evaluate(`Boolean(document.querySelector('${column} textarea'))`), false)
  await screenshot('column-working')
  await step('all done')
  await step('final answer')
  await wait(`(document.querySelector('${column} [data-testid="pane-column-result"]')?.innerText ?? '').includes('PAGOS MIGRADOS')`)
  assert.equal(await evaluate(`document.querySelector('${column}').dataset.collapsed`), 'true')
  assert((await text(`${column} [data-testid="pane-column-result"]`)).toLowerCase().includes('nuevo'))
  await screenshot('column-done')

  // The peek after a pause over the column: the last answer and «Ver todo».
  const box = await evaluate(`(() => { const r = document.querySelector('${column} .pane-column-expand').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 60) } })()`)
  ui.win.webContents.sendInputEvent({ type: 'mouseMove', x: 5, y: 400 })
  ui.win.webContents.sendInputEvent({ type: 'mouseMove', x: box.x, y: box.y })
  await delay(150)
  assert.equal(await evaluate(`Boolean(document.querySelector('[data-testid="pane-peek"]'))`), false, 'not open while passing by')
  await wait(`(document.querySelector('[data-testid="pane-peek"]')?.innerText ?? '').includes('PAGOS MIGRADOS')`)
  await screenshot('column-peek')
  // Esc closes it, as the plan says.
  ui.win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
  ui.win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
  await wait(`!document.querySelector('[data-testid="pane-peek"]')`)

  // No room for the column beside a wide open pane: it falls back to the strip.
  await seedBoard({
    boardId: 'collapsed_live',
    fitToView: false,
    panes: [
      { paneId: 'pane_0', sessionId: ids[0], width: 1300, collapsed: false },
      { paneId: 'pane_1', sessionId: ids[1], width: 700, collapsed: true },
    ],
    focusedPaneId: 'pane_0',
  })
  await wait(`document.querySelector('${column}')?.dataset.variant === 'strip'`)
  const strip = await evaluate(`Math.round(document.querySelector('${column}').getBoundingClientRect().width)`)
  assert(Math.abs(strip - 48) <= 2, 'the strip is 48 px: ' + strip)
  await screenshot('strip-no-room')
  report({ passed: ['column while it fits', 'live steps without unfolding', 'result marked new', 'peek after a pause', 'strip when there is no room'] })
})

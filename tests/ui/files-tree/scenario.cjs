// El árbol de la vista Archivos (plan 0.4.0 #98) con el Engine real:
// 1. «Archivos del proyecto» lista el proyecto; una carpeta que solo contiene
//    otra se abre con ella en una fila («docs/guia»).
// 2. Un archivo arrastrado del árbol al composer entra como «@archivo»
//    (adjunto del espacio de trabajo y la mención en el texto).
// 3. Con el panel ancho (P9), el visor va a la izquierda y el árbol en una
//    columna a la derecha; su borde se arrastra y el ancho se guarda.
// 4. El botón de la cabecera pliega la columna (animada, o al momento con
//    movimiento reducido) y la vuelve a mostrar con su ancho.
// 5. Angosto otra vez, el árbol vuelve encima del visor y el botón se va.
const assert = require('node:assert/strict')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { click, clickText, command, delay, evaluate, input, reload, report, scenario, screenshot, settleAnimations, toggleDockView, ui, useLocalModel, wait } = require('../harness.cjs')

const TREE = '[data-testid="file-tree"]'
const row = (path) => `${TREE} [data-path=${JSON.stringify(path)}]`
const FILES = '[data-dock-view="files"]'
const SIDE = `${FILES} [data-testid="files-side"]`
const TOGGLE = `${FILES} [data-testid="files-tree-toggle"]`
const EDGE = '.session-workspace [role="separator"][aria-orientation="vertical"]'
const reduced = process.env.RINARI_UI_REDUCED_MOTION === '1'
const rect = (selector) => evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null })()`)
const storedTree = () => evaluate(`Object.values(JSON.parse(localStorage.getItem('rinari.sessionDock.v1') || '{}')).find((layout) => layout.views?.includes('files'))?.tree ?? null`)

async function drag(from, to, steps = 8) {
  ui.win.focus()
  ui.win.webContents.sendInputEvent({ type: 'mouseMove', x: from.x, y: from.y })
  ui.win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, x: from.x, y: from.y })
  for (let i = 1; i <= steps; i++) {
    const x = Math.round(from.x + ((to.x - from.x) * i) / steps)
    const y = Math.round(from.y + ((to.y - from.y) * i) / steps)
    ui.win.webContents.sendInputEvent({ type: 'mouseMove', button: 'left', x, y })
    await delay(30)
  }
  ui.win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: to.x, y: to.y })
  await delay(250)
}
const middle = (box) => ({ x: Math.round(box.x + box.w / 2), y: Math.round(box.y + box.h / 2) })
/** Ancho de la columna del árbol en cada cuadro mientras corre `action` (-1: ya no está). */
async function sampleSide(action) {
  await evaluate(`(() => { window.__side = []; const start = performance.now(); const step = () => { const el = document.querySelector(${JSON.stringify(SIDE)}); window.__side.push(el ? Math.round(el.getBoundingClientRect().width) : -1); if (performance.now() - start < 700) requestAnimationFrame(step) }; requestAnimationFrame(step); return true })()`)
  await action()
  await delay(800)
  return evaluate('window.__side')
}

scenario(async () => {
  await useLocalModel()
  const root = join(ui.data, 'workspace', 'tienda')
  for (const dir of ['src/caja', 'docs/guia']) mkdirSync(join(root, dir), { recursive: true })
  for (const file of ['src/caja/ticket.ts', 'src/main.ts', 'docs/guia/intro.md', 'README.md', 'package.json']) writeFileSync(join(root, file), `// ${file}\n`)
  const added = await command('project_add', { path: root, name: 'Tienda' })
  await command('session_create', { project_id: added.project?.id ?? added.id, title: 'Árbol' })
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Árbol', 'aside button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  await input('.composer-surface textarea', 'Hola')
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await wait(`document.body.innerText.includes('HOLA')`)
  await toggleDockView('files')
  await wait(`Boolean(document.querySelector(${JSON.stringify(row('docs'))}))`)

  // 1. A folder holding only another opens with it: one row «docs/guia».
  await click(row('docs'))
  await wait(`document.querySelector(${JSON.stringify(row('docs/guia'))})?.textContent.includes('docs/guia')`)
  await wait(`Boolean(document.querySelector(${JSON.stringify(row('docs/guia/intro.md'))}))`)
  await settleAnimations()
  await screenshot('tree')

  // 2. Drag README.md onto the composer: it comes in as «@README.md».
  await evaluate(`(() => {
    const data = new DataTransfer()
    document.querySelector(${JSON.stringify(row('README.md'))}).dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: data }))
    const surface = document.querySelector('.composer-surface')
    surface.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data }))
    surface.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }))
  })()`)
  await wait(`document.querySelector('.composer-surface textarea').value.includes('@README.md')`)
  assert.ok(await evaluate(`document.querySelector('.composer-surface').innerText.includes('README.md')`), 'the file is attached')
  await delay(200)
  await screenshot('dropped')

  // 3. Widen the panel: the viewer goes left and the tree to a column on the right.
  assert.equal(await evaluate(`Boolean(document.querySelector(${JSON.stringify(TOGGLE)}))`), false, 'no tree button while the panel is narrow')
  const edgeAt = middle(await rect(EDGE))
  await drag(edgeAt, { x: edgeAt.x - 380, y: edgeAt.y }, 10)
  await settleAnimations()
  await wait(`Boolean(document.querySelector(${JSON.stringify(SIDE)}))`)
  assert.equal(await evaluate(`Boolean(document.querySelector('${FILES} .file-tree-section'))`), false, 'the tree is no longer stacked above the viewer')
  await click(row('README.md'))
  await wait(`[...document.querySelectorAll('${FILES} [role="tab"]')].some((tab) => tab.textContent.includes('README.md'))`)
  await wait(`document.querySelector('${FILES} [role="tabpanel"]')?.innerText.includes('README.md')`)
  await settleAnimations()
  const tile = await rect(FILES)
  const side = await rect(SIDE)
  const viewer = await rect(`${FILES} .files-split-main`)
  assert.ok(Math.abs(side.x + side.w - (tile.x + tile.w)) <= 2, `the tree column sits on the right edge (${JSON.stringify({ side, tile })})`)
  assert.ok(viewer.x < side.x && viewer.w > side.w, `the viewer is on the left and wider (${Math.round(viewer.w)} vs ${Math.round(side.w)})`)
  assert.ok(Math.abs(side.w - 260) <= 2, `default tree width (${Math.round(side.w)})`)
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(TOGGLE)}).getAttribute('aria-pressed')`), 'true', 'the header button shows the tree is open')
  await screenshot('side')

  // The divider follows the pointer and the width is kept for the session.
  const divider = middle(await rect(`${SIDE} [role="separator"]`))
  await drag(divider, { x: divider.x - 80, y: divider.y })
  const wider = await rect(SIDE)
  assert.ok(Math.abs(wider.w - 340) <= 3, `the divider moved 80 px (${Math.round(wider.w)})`)
  await delay(400)
  assert.ok(Math.abs((await rect(SIDE)).w - wider.w) <= 1, 'no bounce after release')
  assert.ok(Math.abs(((await storedTree())?.widthPx ?? 0) - wider.w) <= 1, 'the width is saved with the session layout')

  // 4. The header button folds the column (the viewer takes the room) and brings it back.
  const closing = await sampleSide(() => click(TOGGLE))
  assert.equal(closing.at(-1), -1, 'the column is gone')
  const between = closing.filter((value) => value > 20 && value < wider.w - 20)
  if (reduced) assert.equal(between.length, 0, `reduced motion: no in-between frames (${closing})`)
  else {
    assert.ok(between.length >= 2, `the column folds over several frames (${closing})`)
    const shown = closing.filter((value) => value >= 0)
    assert.ok(shown.every((value, i) => i === 0 || value <= shown[i - 1] + 1), `it only shrinks (${shown})`)
  }
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(TOGGLE)}).getAttribute('aria-pressed')`), 'false', 'the button shows the tree is hidden')
  assert.equal((await storedTree())?.open, false, 'hidden is remembered')
  const full = await rect(`${FILES} .files-split-main`)
  assert.ok(Math.abs(full.w - tile.w) <= 3, `the viewer takes the whole view (${Math.round(full.w)} vs ${Math.round(tile.w)})`)
  await screenshot('side-hidden')
  const opening = await sampleSide(() => click(TOGGLE))
  assert.ok(Math.abs(opening.at(-1) - wider.w) <= 1, `it comes back at its width (${opening.at(-1)})`)
  if (reduced) assert.equal(opening.filter((value) => value > 20 && value < wider.w - 20).length, 0, `reduced motion: appears at once (${opening})`)
  else assert.ok(opening.filter((value) => value > 20 && value < wider.w - 20).length >= 2, `the column unfolds over several frames (${opening})`)

  // 5. Narrow again: the tree goes back above the viewer and the button leaves.
  const edgeBack = middle(await rect(EDGE))
  await drag(edgeBack, { x: edgeBack.x + 380, y: edgeBack.y }, 10)
  await settleAnimations()
  await wait(`Boolean(document.querySelector('${FILES} .file-tree-section')) && !document.querySelector(${JSON.stringify(SIDE)})`)
  assert.equal(await evaluate(`Boolean(document.querySelector(${JSON.stringify(TOGGLE)}))`), false, 'no tree button once narrow')
  assert.ok(await evaluate(`Boolean(document.querySelector('${FILES} .dock-section[data-section="artifacts"]'))`), 'Artifacts is still at the foot')
  await screenshot('narrow-again')
  report({ passed: ['project tree with a compact folder', 'drag a file into the composer as @file', 'wide panel: viewer left, tree column right', 'tree divider resizes and is saved', 'header button folds and restores the column', 'narrow panel stacks the tree again'] })
}, { width: 1400, height: 900 })

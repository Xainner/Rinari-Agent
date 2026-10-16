// Panel lateral nuevo (plan 0.4.0 #47 y #44a) con el Engine real:
// 1. Sin conversación no hay botones de vistas; con una, aparecen en la barra de título.
// 2. Navegador y Terminal se apilan; la vista nueva viaja desde su botón (cuadro a cuadro).
// 3. El separador sigue al puntero y al soltar no rebota.
// 4. Con 4 vistas, 2×2; una quinta pregunta cuál reemplazar y ocupa su sitio.
// 5. Una vista se arrastra por su cabecera y cambia de sitio con otra.
// 6. «Ampliar» lleva el panel a la conversación (el chat queda en 300 px) y Esc lo devuelve.
// 7. Ctrl+B oculta y vuelve a mostrar el panel con la misma disposición.
// 8. Un panel angosto pone las vistas en una sola columna; y cada conversación recuerda la suya.
const assert = require('node:assert/strict')
const { click, clickText, command, delay, evaluate, input, key, reload, report, scenario, screenshot, settleAnimations, size, ui, useLocalModel, wait } = require('../harness.cjs')

const DOCK = '[data-testid="session-dock"]'
const BAR = '.dock-view-bar'
const reduced = process.env.RINARI_UI_REDUCED_MOTION === '1'
const views = () => evaluate(`document.querySelector('${DOCK}')?.dataset.views ?? ''`)
const button = (label) => `${BAR} button[aria-label^="${label}"]`
const rect = (selector) => evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null })()`)

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

async function send(text, reply) {
  await input('.composer-surface textarea', text)
  await wait(`!document.querySelector('.composer-surface button[aria-label="Enviar mensaje"]')?.disabled`)
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await wait(`document.body.innerText.includes(${JSON.stringify(reply)})`)
}

scenario(async () => {
  await useLocalModel()
  const a = (await command('session_create', { chat: true, title: 'Panel A' })).session.id
  await command('session_create', { chat: true, title: 'Panel B' })
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')

  // 1. A conversation with nothing sent has no view buttons; after the first reply they appear.
  await clickText('Panel A', 'aside li button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  assert.equal(await evaluate(`Boolean(document.querySelector('${BAR}'))`), false, 'no view buttons without a conversation')
  await send('Hola', 'RESPUESTA UNO')
  await wait(`Boolean(document.querySelector('${BAR}'))`)
  // Flujos ya no es un modo de arriba: es una vista del panel lateral (#43).
  assert.equal(await evaluate(`[...document.querySelectorAll('.view-switcher button')].some(b => /Flujo/.test(b.textContent))`), false, 'no Flujos in the top switcher')
  await screenshot('title-bar-buttons')
  await click(button('Flujo'))
  await wait(`Boolean(document.querySelector('${DOCK} [data-testid="flow-view"][data-embedded]'))`)
  await wait(`Boolean(document.querySelector('${DOCK} [role="radiogroup"][aria-label="Alcance del flujo"]'))`)
  await settleAnimations()
  await screenshot('flow-in-panel')
  await click(button('Flujo'))
  await wait(`!document.querySelector('${DOCK}')`)

  // 2. Browser, then Terminal: they stack, and the new one travels from its button.
  await click(button('Navegador'))
  await wait(`document.querySelector('${DOCK}')?.dataset.views === 'browser'`)
  await settleAnimations()
  if (!reduced) {
    await evaluate(`(() => {
      window.__ghost = []
      const tick = () => {
        const ghost = document.querySelector('.dock-launch-ghost')
        if (ghost) { const r = ghost.getBoundingClientRect(); window.__ghost.push({ x: r.x, y: r.y, w: r.width, h: r.height }) }
        if (window.__ghost.length < 40 && performance.now() - start < 900) requestAnimationFrame(tick)
      }
      const start = performance.now()
      requestAnimationFrame(tick)
    })()`)
  }
  await click(button('Terminal'))
  await wait(`document.querySelector('${DOCK}')?.dataset.views === 'browser terminal'`)
  await delay(700)
  if (!reduced) {
    const ghost = await evaluate('window.__ghost')
    assert.ok(ghost.length >= 4, `the new view travels from its button (${ghost.length} frames)`)
    const tops = ghost.map((frame) => frame.y)
    const monotonic = tops.every((top, i) => i === 0 || top >= tops[i - 1] - 0.5)
    assert.ok(monotonic, `the ghost moves one way, without overshoot (${tops.map(Math.round)})`)
  } else {
    assert.equal(await evaluate(`Boolean(document.querySelector('.dock-launch-ghost'))`), false, 'no ghost with reduced motion')
  }
  await settleAnimations()
  assert.equal(await evaluate(`document.querySelector('${DOCK} .dock-mosaic').dataset.shape`), '2', 'two views stacked in one column')
  await screenshot('browser-terminal')

  // 3. The separator follows the pointer exactly and does not bounce on release.
  const top = await rect(`${DOCK} [data-dock-view="browser"]`)
  const splitter = await rect(`${DOCK} .dock-splitter[data-axis="y"]`)
  const grab = { x: Math.round(splitter.x + splitter.w / 2), y: Math.round(splitter.y + splitter.h / 2) }
  await drag(grab, { x: grab.x, y: grab.y + 60 })
  const after = await rect(`${DOCK} [data-dock-view="browser"]`)
  assert.ok(Math.abs(after.h - top.h - 60) <= 2, `separator moved 60 px (${Math.round(after.h - top.h)})`)
  await delay(400)
  const settled = await rect(`${DOCK} [data-dock-view="browser"]`)
  assert.ok(Math.abs(settled.h - after.h) <= 1, 'no bounce after release')

  // 4. Widen the panel past 800 px (no cap, #44a). Four views make a 2×2 grid; a fifth asks which one to replace.
  const edge = await rect('.session-workspace [role="separator"][aria-orientation="vertical"]')
  const edgeAt = { x: Math.round(edge.x + edge.w / 2), y: Math.round(edge.y + edge.h / 2) }
  await drag(edgeAt, { x: edgeAt.x - 460, y: edgeAt.y }, 10)
  await settleAnimations()
  const wide = await rect(DOCK)
  assert.ok(wide.w > 800, `the panel goes past the old 800 px cap (${Math.round(wide.w)})`)
  await click(button('Archivos'))
  await click(button('Cambios'))
  await wait(`document.querySelector('${DOCK}')?.dataset.views === 'browser terminal files changes'`)
  await settleAnimations()
  assert.equal(await evaluate(`document.querySelector('${DOCK} .dock-mosaic').dataset.shape`), '22', 'four views in a 2×2 grid')
  await screenshot('four-views')
  await click(button('Agentes'))
  await wait(`Boolean(document.querySelector('.dock-replace'))`)
  await screenshot('replace-prompt')
  await clickText('Archivos', '.dock-replace-option', { includes: true })
  await wait(`document.querySelector('${DOCK}')?.dataset.views === 'browser terminal agents changes'`)

  // 5. Drag Terminal by its header onto Changes: they swap.
  const head = await rect(`${DOCK} [data-dock-view="terminal"] .dock-tile-head`)
  const target = await rect(`${DOCK} [data-dock-view="changes"]`)
  await drag({ x: Math.round(head.x + 60), y: Math.round(head.y + head.h / 2) }, { x: Math.round(target.x + target.w / 2), y: Math.round(target.y + target.h / 2) }, 12)
  await wait(`document.querySelector('${DOCK}')?.dataset.views === 'browser changes agents terminal'`)

  // 6. Amplify the browser: the chat keeps a 300 px column; Esc restores.
  const before = await rect(DOCK)
  await click(`${DOCK} [data-dock-view="browser"] button[aria-label="Ampliar Navegador"]`)
  await wait(`document.querySelector('${DOCK}')?.dataset.views === 'browser'`)
  await settleAnimations()
  await delay(450)
  const chat = await rect('.session-workspace-chat')
  assert.ok(Math.abs(chat.w - 300) <= 2, `the chat keeps a 300 px column (${Math.round(chat.w)})`)
  await screenshot('amplified')
  await key('Escape')
  await wait(`document.querySelector('${DOCK}')?.dataset.views === 'browser changes agents terminal'`)
  await delay(450)
  const restored = await rect(DOCK)
  assert.ok(Math.abs(restored.w - before.w) <= 2, 'Esc gives the panel its width back')

  // 7. Ctrl+B hides the panel without closing its views, and shows them again.
  await click('.composer-surface textarea')
  await key('B', ['control'])
  await wait(`!document.querySelector('${DOCK}')`)
  await key('B', ['control'])
  await wait(`document.querySelector('${DOCK}')?.dataset.views === 'browser changes agents terminal'`)

  // 8. A narrow panel puts every view in one column.
  await size(1100, 820)
  await wait(`document.querySelector('${DOCK} .dock-mosaic')?.dataset.shape === '4'`)
  await settleAnimations()
  await screenshot('narrow-single-column')
  await size(1500, 900)

  // Each conversation keeps its own layout.
  await clickText('Panel B', 'aside li button', { includes: true })
  await send('Hola B', 'RESPUESTA DOS')
  assert.equal(await evaluate(`Boolean(document.querySelector('${DOCK}'))`), false, 'the other conversation has its own (empty) layout')
  await clickText('Panel A', 'aside li button', { includes: true })
  await wait(`document.querySelector('${DOCK}')?.dataset.views === 'browser changes agents terminal'`)
  report({ session: a, passed: ['no buttons without a conversation', 'views stack and travel from their button', 'separator follows the pointer', '2×2 and replace', 'drag a view by its header', 'amplify and Esc', 'Ctrl+B', 'narrow single column', 'layout per conversation'] })
}, { width: 1500, height: 900 })

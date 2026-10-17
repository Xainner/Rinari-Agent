// Barra lateral izquierda de ancho ajustable:
// 1. El asa del borde derecho no se ve en reposo; aparece al acercar el ratón.
// 2. Arrastrarla ensancha la barra exactamente lo arrastrado, sin rebote al soltar.
// 3. Tiene un mínimo y un máximo.
// 4. El ancho se recuerda al recargar; doble clic vuelve al de siempre.
const assert = require('node:assert/strict')
const { click, delay, evaluate, reload, report, scenario, screenshot, settleAnimations, ui, wait } = require('../harness.cjs')

const ASIDE = 'aside.app-sidebar'
const HANDLE = `${ASIDE} [role="separator"][aria-orientation="vertical"]`
const width = () => evaluate(`Math.round(document.querySelector(${JSON.stringify(ASIDE)}).getBoundingClientRect().width)`)
const center = () => evaluate(`(() => { const r = document.querySelector(${JSON.stringify(HANDLE)}).getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } })()`)
const look = () => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(HANDLE)}); const line = getComputedStyle(el, '::before').backgroundColor; return { pill: Number(getComputedStyle(el, '::after').opacity), line: line === 'transparent' || line === 'rgba(0, 0, 0, 0)' ? 'none' : line, grab: Math.round(el.getBoundingClientRect().width) } })()`)

async function drag(from, dx, steps = 8) {
  ui.win.focus()
  ui.win.webContents.sendInputEvent({ type: 'mouseMove', x: from.x, y: from.y })
  ui.win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, x: from.x, y: from.y })
  for (let i = 1; i <= steps; i++) {
    ui.win.webContents.sendInputEvent({ type: 'mouseMove', button: 'left', x: Math.round(from.x + (dx * i) / steps), y: from.y })
    await delay(30)
  }
  ui.win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: from.x + dx, y: from.y })
  await delay(250)
}

scenario(async () => {
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  await wait(`Boolean(document.querySelector(${JSON.stringify(HANDLE)}))`)
  await settleAnimations()
  const start = await width()

  // 1. Hidden at rest, shown with the pointer near.
  ui.win.webContents.sendInputEvent({ type: 'mouseMove', x: 900, y: 450 })
  await delay(300)
  const rest = await look()
  assert.ok(rest.pill === 0 && rest.line === 'none', `the handle is hidden at rest: ${JSON.stringify(rest)}`)
  assert.ok(rest.grab >= 14, 'the handle keeps a comfortable grab zone')
  const grab = await center()
  assert.ok(Math.abs(grab.x - start) <= 2, `the handle sits on the right edge (${grab.x} / ${start})`)
  ui.win.webContents.sendInputEvent({ type: 'mouseMove', x: grab.x, y: grab.y })
  await delay(300)
  const near = await look()
  assert.ok(near.pill > 0.9 && near.line !== 'none', `the handle shows up with the pointer near: ${JSON.stringify(near)}`)

  // 2. It follows the pointer exactly and does not bounce.
  await drag(grab, 80)
  const wider = await width()
  assert.ok(Math.abs(wider - start - 80) <= 2, `the sidebar widened 80 px (${start} → ${wider})`)
  await delay(400)
  assert.ok(Math.abs((await width()) - wider) <= 1, 'no bounce after release')
  await screenshot('resized')

  // 3. Minimum and maximum.
  await drag(await center(), -400)
  assert.equal(await width(), 220, 'the sidebar stops at its minimum')
  await drag(await center(), 700)
  const max = await width()
  const limit = await evaluate('Math.min(440, Math.round(window.innerWidth * 0.4))')
  assert.equal(max, limit, `the sidebar stops at its maximum (${max} / ${limit})`)

  // 4. Remembered across a reload; a double click goes back to the usual width.
  await drag(await center(), -100)
  const chosen = await width()
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  await wait(`Boolean(document.querySelector(${JSON.stringify(HANDLE)}))`)
  await settleAnimations()
  assert.equal(await width(), chosen, 'the width is remembered')
  const back = await center()
  ui.win.webContents.sendInputEvent({ type: 'mouseMove', x: back.x, y: back.y })
  ui.win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, x: back.x, y: back.y })
  ui.win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: back.x, y: back.y })
  ui.win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 2, x: back.x, y: back.y })
  ui.win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 2, x: back.x, y: back.y })
  await delay(500)
  await settleAnimations()
  assert.equal(await width(), 278, 'a double click restores the usual width')
  report({ passed: ['handle hidden at rest, shown near the pointer', 'follows the pointer without bounce', 'minimum and maximum', 'width remembered', 'double click restores it'] })
})

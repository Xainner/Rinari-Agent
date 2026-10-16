// Plan 0.4.0 #88, #20 y #58: mientras Rinari escribe una respuesta larga y
// pesada (bloques de código, una tabla con rutas largas, negritas), el chat
// sigue abajo del todo. Se muestrea cada cuadro: la flecha «Ir al final»
// nunca aparece, el seguimiento no se apaga sin un gesto (tampoco con un clic
// en el chat) y al terminar la distancia al fondo es de 2 px o menos.
const assert = require('node:assert/strict')
const { click, clickText, command, evaluate, input, reload, report, scenario, screenshot, useLocalModel, wait } = require('../harness.cjs')

const scroller = '.conversation-enter > .overflow-y-auto'
const arrow = 'button[aria-label="Ir al final"]'

async function sample() {
  await evaluate(`(() => {
    const state = window.__follow = { frames: 0, arrow: 0, maxGap: 0, errors: 0, messages: [], done: false }
    window.addEventListener('error', (event) => { state.errors += 1; if (state.messages.length < 5) state.messages.push(String(event.message)) })
    const tick = () => {
      const el = document.querySelector(${JSON.stringify(scroller)})
      if (el) {
        state.frames += 1
        if (document.querySelector(${JSON.stringify(arrow)})) state.arrow += 1
        state.maxGap = Math.max(state.maxGap, el.scrollHeight - el.scrollTop - el.clientHeight)
      }
      if (!state.done) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })()`)
}

async function turn(text, { clickMidway = false } = {}) {
  await input('.composer-surface textarea', text)
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await sample()
  await wait(`Boolean(document.querySelector('button[aria-label="Detener generación"]'))`)
  if (clickMidway) {
    // Un clic en el chat (sin mover la rueda) no es leer arriba.
    await wait(`(() => { const el = document.querySelector(${JSON.stringify(scroller)}); return el && el.scrollHeight > el.clientHeight * 2 })()`)
    await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(scroller)}); const r = el.getBoundingClientRect(); const at = { bubbles: true, clientX: r.left + 40, clientY: r.top + 40 }; el.dispatchEvent(new PointerEvent('pointerdown', at)); window.dispatchEvent(new PointerEvent('pointerup', at)); el.dispatchEvent(new MouseEvent('click', at)) })()`)
  }
  await wait(`!document.querySelector('button[aria-label="Detener generación"]')`, 60_000)
  // Unos cuadros más: el resultado y la tarjeta del turno terminan de crecer.
  await evaluate(`new Promise((resolve) => { let n = 0; const go = () => (++n >= 30 ? resolve() : requestAnimationFrame(go)); requestAnimationFrame(go) })`)
  const result = await evaluate(`(() => { const s = window.__follow; s.done = true; const el = document.querySelector(${JSON.stringify(scroller)}); return { ...s, finalGap: el.scrollHeight - el.scrollTop - el.clientHeight } })()`)
  assert(result.frames > 30, `sampled frames: ${JSON.stringify(result)}`)
  assert.equal(result.arrow, 0, `the «Ir al final» arrow appeared while following: ${JSON.stringify(result)}`)
  assert(result.finalGap <= 2, `the chat did not end at the bottom: ${JSON.stringify(result)}`)
  assert.equal(result.errors, 0, `renderer errors while streaming: ${JSON.stringify(result)}`)
  return result
}

scenario(async () => {
  await useLocalModel()
  await command('session_create', { chat: true, title: 'Seguir el final' })
  await reload()
  await clickText('Seguir el final', 'aside button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  const first = await turn('Explícame el informe completo.')
  await screenshot('after-heavy-stream')
  const second = await turn('Otra vez, con más detalle.', { clickMidway: true })
  await screenshot('after-click-midway')
  report({ passed: ['follows a heavy streamed answer to the last pixel', 'a click in the chat does not stop following', 'no renderer errors'], metrics: { first, second } })
}, { width: 1300, height: 820 })

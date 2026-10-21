// Seguir el final cuando el turno pasa de escribir a usar herramientas (dueño,
// 2026-10-21): con el chat ya largo, un mensaje cuya respuesta abre con un texto
// corto y encadena herramientas antes de la respuesta final. Se muestrea cada
// cuadro: la flecha «Ir al final» nunca aparece, el final no queda tapado más
// de medio segundo seguido y al terminar la distancia al fondo es de 2 px o menos.
const assert = require('node:assert/strict')
const { click, clickText, command, evaluate, input, reload, report, scenario, screenshot, settleAnimations, toggleDockView, useLocalModel, wait } = require('../harness.cjs')

const scroller = '.conversation-enter > .overflow-y-auto'
const arrow = 'button[aria-label="Ir al final"]'

async function sample() {
  await evaluate(`(() => {
    const state = window.__follow = { frames: 0, arrow: 0, maxGap: 0, run: 0, longestRun: 0, maxOverlap: 0, overlapFrames: 0, errors: 0, messages: [], done: false }
    window.addEventListener('error', (event) => { state.errors += 1; if (state.messages.length < 5) state.messages.push(String(event.message)) })
    const tick = () => {
      const el = document.querySelector(${JSON.stringify(scroller)})
      if (el) {
        state.frames += 1
        if (document.querySelector(${JSON.stringify(arrow)})) state.arrow += 1
        const gap = el.scrollHeight - el.scrollTop - el.clientHeight
        state.maxGap = Math.max(state.maxGap, gap)
        // Un cuadro suelto lejos del fondo es el contenido creciendo antes del
        // seguimiento; muchos seguidos son el final tapado.
        state.run = gap > 24 ? state.run + 1 : 0
        state.longestRun = Math.max(state.longestRun, state.run)
        // Lo que el composer tapa del chat: el borde de abajo del área del chat
        // contra el borde de arriba del composer (su caja visible).
        const box = document.querySelector('.conversation-composer-slot .composer-surface') || document.querySelector('.conversation-composer-slot')
        if (box) {
          const overlap = Math.round(el.getBoundingClientRect().bottom - box.getBoundingClientRect().top)
          state.maxOverlap = Math.max(state.maxOverlap, overlap)
          if (overlap > 4) state.overlapFrames += 1
        }
      }
      if (!state.done) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })()`)
}

async function turn(text) {
  await input('.composer-surface textarea', text)
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await sample()
  await wait(`Boolean(document.querySelector('button[aria-label="Detener generación"]'))`)
  await wait(`!document.querySelector('button[aria-label="Detener generación"]')`, 60_000)
  await evaluate(`new Promise((resolve) => { let n = 0; const go = () => (++n >= 30 ? resolve() : requestAnimationFrame(go)); requestAnimationFrame(go) })`)
  const result = await evaluate(`(() => { const s = window.__follow; s.done = true; const el = document.querySelector(${JSON.stringify(scroller)}); return { ...s, finalGap: el.scrollHeight - el.scrollTop - el.clientHeight } })()`)
  assert(result.frames > 30, `sampled frames: ${JSON.stringify(result)}`)
  assert.equal(result.arrow, 0, `the «Ir al final» arrow appeared while following: ${JSON.stringify(result)}`)
  assert(result.longestRun <= 30, `the end stayed covered for ${result.longestRun} frames in a row: ${JSON.stringify(result)}`)
  assert(result.finalGap <= 2, `the chat did not end at the bottom: ${JSON.stringify(result)}`)
  assert(result.overlapFrames === 0, `the composer covered the end of the chat (${result.maxOverlap} px): ${JSON.stringify(result)}`)
  assert.equal(result.errors, 0, `renderer errors: ${JSON.stringify(result)}`)
  return result
}

scenario(async () => {
  await useLocalModel()
  await command('session_create', { chat: true, title: 'Seguir con herramientas' })
  await reload()
  await clickText('Seguir con herramientas', 'aside button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  // Primero un chat largo, para que haya desplazamiento.
  const first = await turn('Explícame el informe completo.')
  const tools = await turn('Adáptalo al zoom actual.')
  await screenshot('after-tools')
  // Con el panel lateral abierto en el Navegador (dueño): el chat es más
  // angosto y el composer del turno en curso ocupa más alto.
  await toggleDockView('browser')
  await wait(`Boolean(document.querySelector('[data-testid="session-dock"]'))`)
  await settleAnimations()
  // Un clic en el chat que se suelta sobre el navegador del panel (una vista
  // nativa): la app recibe el pointerdown pero nunca el pointerup.
  await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(scroller)}); const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + 40, clientY: r.top + 40 })); window.dispatchEvent(new Event('blur')) })()`)
  const withPanel = await turn('¿Sería bueno cuando Asia abra indagar?')
  await screenshot('after-tools-panel')
  report({ passed: ['follows when a turn moves from text to tools', 'the same with the side panel open', 'the end is never covered for long', 'ends at the bottom'], metrics: { first, tools, withPanel } })
}, { width: 1300, height: 820 })

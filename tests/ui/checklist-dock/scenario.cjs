// Lista de tareas en vivo con el Engine real y un modelo guionado:
// 1. Rinari arma la lista con checklist.update y la va marcando; al terminar
//    con pasos pendientes queda «Quedan 2 pasos» sobre el composer, sin
//    taparlo, y desplegada muestra cada paso con su estado.
// 2. Recargar la app conserva la lista (session.checklist.get), quieta.
// 3. El turno siguiente la completa: «Todo hecho». El siguiente la retira.
// 4. Una conversación simple nunca muestra el dock.
const assert = require('node:assert/strict')
const { click, clickText, command, evaluate, input, reload, report, scenario, screenshot, settleAnimations, useLocalModel, wait } = require('../harness.cjs')

const text = (value) => `document.body.innerText.includes(${JSON.stringify(value)})`
const SEND = '.composer-surface button[aria-label="Enviar mensaje"]'
const DOCK = '[data-testid="checklist-dock"]'

async function send(message) {
  await input('.composer-surface textarea', message)
  await wait(`!document.querySelector(${JSON.stringify(SEND)})?.disabled`)
  await click(SEND)
  await wait(`document.querySelector('.composer-surface textarea').value === ''`)
}

// La zona del composer nunca muestra barra propia: ni con la lista plegada,
// ni desplegada, ni con un borrador largo que hace crecer el composer.
const NO_SLOT_SCROLL = `(() => {
  const slot = document.querySelector('.conversation-composer-slot')
  const style = getComputedStyle(slot)
  return { overflow: slot.scrollHeight - slot.clientHeight, scrolls: /auto|scroll/.test(style.overflowY) }
})()`
async function assertNoSlotScroll(label) {
  await settleAnimations()
  const slot = await evaluate(NO_SLOT_SCROLL)
  assert(!slot.scrolls && slot.overflow <= 1, `${label}: the composer area does not scroll (${JSON.stringify(slot)})`)
}

async function openChat(title) {
  // Solo filas de conversación: el selector de perfil de arriba dice «Lista para trabajar».
  await clickText(title, 'aside li button', { includes: true })
  await wait(`document.querySelector('aside button[aria-current="page"]')?.textContent.includes(${JSON.stringify(title)})`)
  await wait('Boolean(document.querySelector(".composer-surface"))')
}

scenario(async () => {
  await useLocalModel()
  await command('session_create', { chat: true, title: 'Lista' })
  await command('session_create', { chat: true, title: 'Charla' })
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  await openChat('Lista')

  // 1. The list is built and kept while the turn works.
  await send('Prepara el informe en tres pasos')
  await wait(text('PRIMERA PARTE'))
  await wait(`document.querySelector(${JSON.stringify(DOCK)})?.dataset.state === 'open'`)
  const dock = (expr) => `(() => { const d = document.querySelector(${JSON.stringify(DOCK)}); return ${expr} })()`
  assert(await evaluate(dock("d.textContent.includes('Quedan 2 pasos') && d.textContent.includes('1/3')")), 'open list with its progress')
  // Above the composer, never over it.
  await settleAnimations()
  const layout = await evaluate(`(() => {
    const d = document.querySelector(${JSON.stringify(DOCK)}).getBoundingClientRect()
    const c = document.querySelector('.composer-surface').getBoundingClientRect()
    return { dockBottom: d.bottom, composerTop: c.top, dockHeight: d.height }
  })()`)
  assert(layout.dockBottom <= layout.composerTop + 1, 'dock sits above the composer')
  assert(layout.dockHeight < 60, 'collapsed dock is one line')
  await assertNoSlotScroll('collapsed dock')
  await screenshot('collapsed-open')
  const collapsedBody = await evaluate(`document.querySelector(${JSON.stringify(DOCK)} + ' .checklist-body').getBoundingClientRect().height`)
  await click(`${DOCK} .checklist-toggle`)
  await wait(`document.querySelector(${JSON.stringify(DOCK)} + ' .checklist-body')?.hasAttribute('data-open')`)
  await settleAnimations()
  const statuses = await evaluate(`[...document.querySelectorAll(${JSON.stringify(DOCK)} + ' .checklist-item')].map(i => i.dataset.status)`)
  assert.deepEqual(statuses, ['completed', 'in_progress', 'pending'])
  await assertNoSlotScroll('expanded dock')
  await input('.composer-surface textarea', Array.from({ length: 40 }, (_, i) => `línea ${i + 1} de un borrador largo`).join(String.fromCharCode(10)))
  await assertNoSlotScroll('expanded dock and a long draft')
  await input('.composer-surface textarea', '')
  await screenshot('expanded-open')

  // #22: the arrow points where the list moves: open ↓ (180°), closed ↑ (0°).
  const angle = `(() => { const m = getComputedStyle(document.querySelector(${JSON.stringify(DOCK)} + ' .checklist-chevron')).transform; if (m === 'none') return 0; const [a, b] = m.slice(m.indexOf('(') + 1, -1).split(',').map(Number); return Math.abs(Math.round(Math.atan2(b, a) * 180 / Math.PI)) })()`
  assert.equal(await evaluate(angle), 180, 'open: the arrow points down, toward the composer')
  // #26: closing only goes down, frame by frame, and the height cap never lifts.
  await evaluate(`(() => {
    const body = document.querySelector(${JSON.stringify(DOCK)} + ' .checklist-body')
    const inner = body.querySelector('.checklist-body-inner')
    const state = window.__close = { heights: [], uncapped: 0, stop: false }
    const tick = () => {
      state.heights.push(body.getBoundingClientRect().height)
      if (getComputedStyle(inner).maxHeight === 'none') state.uncapped += 1
      if (!state.stop) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })()`)
  await click(`${DOCK} .checklist-toggle`)
  // Sample the whole closing, whatever the screen's refresh rate: until it settles at the collapsed height.
  await wait(`Math.abs(document.querySelector(${JSON.stringify(DOCK)} + ' .checklist-body').getBoundingClientRect().height - ${collapsedBody}) <= 1`, 5000)
  await settleAnimations()
  const closing = await evaluate('(() => { window.__close.stop = true; return window.__close })()')
  const rises = closing.heights.filter((h, i) => i > 0 && h > closing.heights[i - 1] + 0.5).length
  assert.equal(rises, 0, `closing never grows first: ${JSON.stringify(closing.heights.map(Math.round))}`)
  assert.equal(closing.uncapped, 0, 'the height cap stays while closing')
  assert(Math.abs(closing.heights.at(-1) - collapsedBody) <= 1, `back to the collapsed height at the end: ${closing.heights.at(-1)} vs ${collapsedBody}`)
  await settleAnimations()
  assert.equal(await evaluate(angle), 0, 'closed: the arrow points up, where it opens')

  // 2. A reload keeps it, still (no entrance replay).
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  await openChat('Lista')
  await wait(`document.querySelector(${JSON.stringify(DOCK)})?.dataset.state === 'open'`)
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(DOCK)}).classList.contains('is-live')`), false)

  // 3. The next turn finishes it; the one after rolls it over.
  await send('Sigue con lo que falta')
  await wait(text('TODO LISTO'))
  await wait(`document.querySelector(${JSON.stringify(DOCK)})?.dataset.state === 'completed'`)
  assert(await evaluate(dock("d.textContent.includes('Todo hecho') && d.textContent.includes('3/3')")))
  await screenshot('completed')
  await send('Gracias')
  await wait(text('DE NADA'))
  await wait(`!document.querySelector(${JSON.stringify(DOCK)})`)

  // 4. A plain chat never shows a dock.
  await openChat('Charla')
  await send('Hola')
  await wait(text('HOLA DE VUELTA'))
  assert.equal(await evaluate(`Boolean(document.querySelector(${JSON.stringify(DOCK)}))`), false)

  report({ passed: ['list built and kept live', 'the arrow follows where the list moves', 'closing only goes down with the cap in place', 'open after a turn with steps left', 'above the composer, one line collapsed', 'expanded statuses', 'reload keeps it still', 'completed then rolled over', 'plain chat has no dock'] })
})

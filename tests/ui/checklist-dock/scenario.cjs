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

async function openChat(title) {
  await clickText(title, 'aside button', { includes: true })
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
  await screenshot('collapsed-open')
  await click(`${DOCK} .checklist-toggle`)
  await wait(`document.querySelector(${JSON.stringify(DOCK)} + ' .checklist-body')?.hasAttribute('data-open')`)
  await settleAnimations()
  const statuses = await evaluate(`[...document.querySelectorAll(${JSON.stringify(DOCK)} + ' .checklist-item')].map(i => i.dataset.status)`)
  assert.deepEqual(statuses, ['completed', 'in_progress', 'pending'])
  await screenshot('expanded-open')

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

  report({ passed: ['list built and kept live', 'open after a turn with steps left', 'above the composer, one line collapsed', 'expanded statuses', 'reload keeps it still', 'completed then rolled over', 'plain chat has no dock'] })
})

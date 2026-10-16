// La vista «Plan» del panel lateral (plan 0.4.0 #55) con el Engine real:
// 1. Sin plan, la barra de título no tiene botón «Plan».
// 2. Un turno PLAN termina: el botón aparece y la vista se abre sola con el
//    título, los pasos y «Implementar plan» arriba.
// 3. El Resumen lleva al plan desde «Plan y pasos».
const assert = require('node:assert/strict')
const { click, clickText, command, evaluate, input, reload, report, scenario, screenshot, settleAnimations, useLocalModel, wait } = require('../harness.cjs')

const DOCK = '[data-testid="session-dock"]'

scenario(async () => {
  await useLocalModel()
  const { session } = await command('session_create', { chat: true, title: 'Plan de tarjetas' })
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Plan de tarjetas', 'aside li button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  assert.equal(await evaluate(`Boolean(document.querySelector('.dock-view-bar button[data-view="plan"]'))`), false, 'no plan button without a plan')
  await clickText('PLAN', '.composer-surface button')
  await input('.composer-surface textarea', 'Planea las tarjetas regalo')
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await wait(`document.body.innerText.includes('Tarjetas regalo: venta en caja')`)

  // 2. The plan view opens by itself with the plan, and its button appears.
  await wait(`Boolean(document.querySelector('.dock-view-bar button[data-view="plan"]'))`)
  await wait(`Boolean(document.querySelector('${DOCK} [data-testid="plan-view"]'))`)
  const view = await evaluate(`document.querySelector('${DOCK} [data-testid="plan-view"]').innerText`)
  assert.match(view, /Tarjetas regalo: venta en caja/)
  assert.match(view, /3 pasos/i)
  assert.match(view, /Implementar plan/)
  await settleAnimations()
  await screenshot('plan-view')

  // The chat shows a compact card; «Ver plan» opens the view again after closing it.
  const card = await evaluate(`document.querySelector('[data-testid="plan-card"]')?.innerText ?? ''`)
  assert.match(card, /Tarjetas regalo: venta en caja/)
  assert.match(card, /Implementar plan/)
  await click(`${DOCK} button[aria-label="Cerrar Plan"]`)
  await wait(`!document.querySelector('${DOCK}')`)
  await clickText('Ver plan', '[data-testid="plan-card"] button', { includes: true })
  await wait(`Boolean(document.querySelector('${DOCK} [data-testid="plan-view"]'))`)

  // 3. From the Summary, «Plan y pasos» opens the plan.
  await click('.dock-view-bar button[data-view="summary"]')
  await wait(`Boolean(document.querySelector('[data-testid="summary-panel"] [data-card="plan"]'))`)
  await click('[data-testid="summary-panel"] [data-card="plan"] .summary-card-open')
  await wait(`Boolean(document.querySelector('${DOCK} [data-testid="plan-view"]'))`)
  report({ session: session.id, passed: ['compact plan card in the chat opens the view', 'no plan button without a plan', 'plan view opens by itself when a plan finishes', 'title, steps and implement on top', 'summary opens the plan'] })
}, { width: 1500, height: 900 })

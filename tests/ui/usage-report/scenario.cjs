// `/usage` (plan 0.4.0 #78) con el Engine real: el informe se pinta en el
// chat sin llamar al modelo, trae quién lo hizo, el contexto y los límites de
// cada proveedor (o por qué no los informa); `/context` y el «Ver uso
// detallado» del anillo pintan el mismo informe, y las fotos siguen ahí al
// volver a abrir la conversación. Ya no hay pestaña «Contexto y uso».
const assert = require('node:assert/strict')
const { ui, click, clickText, command, evaluate, input, reload, report, scenario, screenshot, settleAnimations, useLocalModel, wait } = require('../harness.cjs')

const CARDS = '[data-testid="usage-report"]'
const served = () => fetch(new URL('/__served', ui.model)).then((r) => r.json()).then((list) => list.length)
const cards = () => evaluate(`document.querySelectorAll(${JSON.stringify(CARDS)}).length`)

async function send(text) {
  await input('.composer-surface textarea', text)
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
}

scenario(async () => {
  const passed = []
  await useLocalModel()
  const { session } = await command('session_create', { chat: true, title: 'Uso' })
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Uso', 'aside button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  await send('Hola')
  await wait(`document.body.innerText.includes('HOLA')`, 30_000)
  await new Promise((resolve) => setTimeout(resolve, 1500))
  const before = await served()

  await send('/usage')
  await wait(`document.querySelectorAll(${JSON.stringify(CARDS)}).length === 1`, 30_000)
  const card = `${CARDS}:last-of-type`
  const who = await evaluate(`document.querySelector('[data-testid="usage-report-client"]')?.textContent ?? ''`)
  assert.match(who, /^Rinari Agent \S+ · Engine \S+/, `the client line says who: ${who}`)
  assert.ok(who.includes('prueba-local'), 'and the conversation provider')
  const limits = await evaluate(`document.querySelector('${CARDS} [data-block="limits"]')?.innerText ?? ''`)
  assert.ok(limits.includes('El proveedor no informa sus límites') && !limits.includes('Remote account'), `a provider without limits says why, in Spanish: ${limits}`)
  assert.ok(await evaluate(`Boolean(document.querySelector('${CARDS} [data-block="models"] table'))`), 'one row per model')
  await evaluate(`document.querySelector(${JSON.stringify(card)}).scrollIntoView({ block: 'center' })`)
  await settleAnimations()
  await screenshot('01-usage')
  passed.push('/usage paints the report with client, limits and models')

  await send('/context')
  await wait(`document.querySelectorAll(${JSON.stringify(CARDS)}).length === 2`, 30_000)
  passed.push('/context paints the same report (no side panel tab any more)')

  await click('.context-ring-button')
  await clickText('Ver uso detallado')
  await wait(`document.querySelectorAll(${JSON.stringify(CARDS)}).length === 3`, 30_000)
  passed.push('the ring «Ver uso detallado» paints it too')

  assert.equal(await served(), before, 'no report called the model')
  passed.push('no model call for any of them')

  const saved = (await command('usage_report_list', { session_id: session.id })).reports
  assert.equal(saved.length, 3, 'each one is saved in the conversation')
  assert.ok(saved.every((item) => Array.isArray(item.limits) && item.client?.engine_version), 'with its limits and client')
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Uso', 'aside button', { includes: true })
  await wait(`document.querySelectorAll(${JSON.stringify(CARDS)}).length === 3`, 30_000)
  assert.equal(await evaluate(`document.body.innerText.includes('Contexto y uso')`), false, 'no «Contexto y uso» anywhere')
  passed.push('the snapshots stay after reopening the conversation')
  report({ passed })
})

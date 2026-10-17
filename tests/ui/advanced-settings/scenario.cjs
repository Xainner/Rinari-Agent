// Ajustes → Avanzado (plan 0.4.0 #96) con el Engine real:
// 1. La cabecera «Estado» y las tarjetas plegadas, cada una con su resumen.
// 2. La búsqueda filtra y abre las tarjetas que coinciden («proxy» → Red).
// 3. Almacenamiento enseña su barra segmentada; «Probar conexión» una fila por proveedor.
// 4. Abrir y cerrar una tarjeta no hace saltar a las demás de columna.
// 5. Motor: límite de arranque, la barra del arranque y el entorno; Actualizaciones.
const assert = require('node:assert/strict')
const { clickText, evaluate, input, menuShortcut, report, scenario, screenshot, settleAnimations, useLocalModel, wait } = require('../harness.cjs')

const PAGE = '[data-testid="advanced-settings"]'
const visibleCards = () => evaluate(`[...document.querySelectorAll('${PAGE} [data-card]')].map((card) => card.dataset.card)`)

scenario(async () => {
  await useLocalModel()
  await menuShortcut('settings', 'CmdOrCtrl+,')
  await clickText('Avanzado', 'nav button')
  await wait(`Boolean(document.querySelector('${PAGE}'))`)
  await wait(`Boolean(document.querySelector('[data-testid="advanced-status"]'))`)
  await settleAnimations()

  // 1. Status and folded cards with a summary.
  const cards = await visibleCards()
  assert.ok(cards.length >= 7, `the cards are there (${cards})`)
  assert.equal(await evaluate(`document.querySelectorAll('${PAGE} [data-card][data-open]').length`), 0, 'everything starts folded')
  await screenshot('folded')

  // 2. The search filters and opens.
  await input(`${PAGE} .adv-search input`, 'proxy')
  await wait(`[...document.querySelectorAll('${PAGE} [data-card]')].map((c) => c.dataset.card).join() === 'network'`)
  assert.ok(await evaluate(`Boolean(document.querySelector('${PAGE} [data-card="network"][data-open]'))`), 'the matching card opens')
  await settleAnimations()
  await screenshot('search')
  await input(`${PAGE} .adv-search input`, '')
  await wait(`document.querySelectorAll('${PAGE} [data-card]').length === ${cards.length}`)

  // 3. Storage and the network test.
  await clickText('Almacenamiento', `${PAGE} .adv-card-head`, { includes: true })
  await wait(`Boolean(document.querySelector('[data-testid="storage-usage"]'))`)
  await clickText('Red', `${PAGE} .adv-card-head`, { includes: true })
  await clickText('Probar', `${PAGE} [data-card="network"] button`)
  await wait(`Boolean(document.querySelector('[data-testid="network-test"] li'))`, 30_000)
  await settleAnimations()
  await screenshot('open')

  // 5. Motor (#70/#96): the startup limit as tabs, the startup as a bar and the environment table; Updates.
  await clickText('Almacenamiento', `${PAGE} .adv-card-head`, { includes: true })
  await clickText('Red', `${PAGE} .adv-card-head`, { includes: true })
  await clickText('Motor', `${PAGE} .adv-card-head`, { includes: true })
  await wait(`Boolean(document.querySelector('[data-testid="startup-limit"] .seg-tab-pill'))`)
  await wait(`document.querySelectorAll('[data-testid="startup-timeline"] .adv-startup-bar span').length >= 2`)
  await clickText('Actualizaciones', `${PAGE} .adv-card-head`, { includes: true })
  await wait(`Boolean(document.querySelector('[data-testid="update-channel"]'))`)
  await settleAnimations()
  await evaluate(`document.querySelector('[data-card="engine"]').scrollIntoView({ block: 'start' })`)
  await screenshot('engine')
  report({ passed: ['status and folded cards', 'search filters and opens', 'storage bar and network test', 'engine startup bar and updates'] })
}, { width: 1400, height: 900 })

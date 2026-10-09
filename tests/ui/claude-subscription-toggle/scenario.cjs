// Claude Subscription es opt-in: apagado por defecto en Ajustes > Proveedores,
// no se ofrece al agregar un proveedor hasta encender el interruptor, y el
// ajuste lo guarda el Engine (lo comparte con la CLI).
const assert = require('node:assert/strict')
const { click, clickText, command, evaluate, key, menuShortcut, report, scenario, screenshot, until, wait } = require('../harness.cjs')

const SWITCH = '[data-testid="experimental-providers"] button[role="switch"]'
const dialogOffersClaude = `[...document.querySelectorAll('[role="dialog"] select option')].some(o => o.textContent.includes('Claude Subscription'))`

async function openAdd() {
  await clickText('Agregar proveedor', 'button')
  await wait(`Boolean(document.querySelector('[role="dialog"]'))`)
  // The dialog loads the catalog from the Engine when it opens.
  await wait(`document.querySelectorAll('[role="dialog"] select option').length > 5`)
}

scenario(async () => {
  assert.equal((await command('provider_settings_get')).external_runtimes, false, 'off by default')
  await menuShortcut('settings', 'CmdOrCtrl+,')
  await clickText('Proveedores', 'nav button')
  await wait(`Boolean(document.querySelector(${JSON.stringify(SWITCH)}))`)
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(SWITCH)}).getAttribute('aria-checked')`), 'false')
  await screenshot('switch-off')

  await openAdd()
  assert.equal(await evaluate(dialogOffersClaude), false, 'not offered while off')
  await key('Escape')

  await click(SWITCH)
  await until(async () => (await command('provider_settings_get')).external_runtimes === true, 'the Engine stores it on')
  await wait(`document.querySelector(${JSON.stringify(SWITCH)}).getAttribute('aria-checked') === 'true'`)
  await wait(`document.body.innerText.includes('se descuenta de los límites')`)
  await screenshot('switch-on')

  await openAdd()
  await wait(dialogOffersClaude)
  await screenshot('add-dialog-offers-claude')
  await key('Escape')

  await click(SWITCH)
  await until(async () => (await command('provider_settings_get')).external_runtimes === false, 'and off again')
  report({ passed: ['off by default', 'not offered while off', 'switch stores the Engine setting', 'offered once on', 'turns off again'] })
}, { width: 1400, height: 900 })

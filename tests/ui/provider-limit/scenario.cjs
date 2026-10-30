// Un turno que falla porque la cuenta del proveedor no tiene cuota dice la
// razón real («no tiene cuota ni créditos»), conserva el mensaje del
// proveedor y ofrece «Revisar uso y límites». Ese botón abre Ajustes >
// Proveedores en la tarjeta del proveedor **que falló**, aunque otro esté
// activo, con la pestaña de uso elegida; «Volver» regresa a la conversación.
const assert = require('node:assert/strict')
const { click, clickText, command, evaluate, input, reload, report, scenario, screenshot, useLocalModel, wait } = require('../harness.cjs')

scenario(async () => {
  await useLocalModel()
  await command('provider_create', { alias: 'otra-cuenta', provider_type: 'custom', auth_method: 'none', endpoint: 'http://127.0.0.1:9/v1' })
  await command('session_create', { chat: true, title: 'Sin créditos' })
  await reload()
  await clickText('Sin créditos', 'aside button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  await input('.composer-surface textarea', 'Resume el informe')
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await wait(`Boolean(document.querySelector('[data-failure="quota"]'))`)
  const alert = await evaluate(`document.querySelector('[data-failure="quota"]').innerText`)
  assert.match(alert, /prueba-local no tiene cuota ni créditos para seguir con/)
  assert.match(alert, /You exceeded your current quota/, 'the provider message stays')
  await screenshot('quota-failure')

  // #24: armed, the card says so and «Reanuda …» shows in the title bar and on the sidebar row.
  await clickText('Continuar automáticamente cuando se restablezca', 'button', { includes: true })
  await wait(`Boolean(document.querySelector('[data-testid="auto-resume"][data-state="waiting"]'))`)
  await wait(`document.querySelectorAll('[data-testid="resume-chip"]').length === 2`)
  const chips = await evaluate(`[...document.querySelectorAll('[data-testid="resume-chip"]')].map(c => ({ label: c.getAttribute('aria-label'), compact: c.classList.contains('is-compact'), inAside: Boolean(c.closest('aside')) }))`)
  assert.ok(chips.every(c => /^Reanuda /.test(c.label)), JSON.stringify(chips))
  assert.ok(chips.some(c => c.compact && c.inAside), 'compact chip on the sidebar row')
  assert.ok(chips.some(c => !c.compact && !c.inAside), 'full chip in the title bar')
  await screenshot('resume-armed')
  await clickText('Cancelar', '[data-testid="auto-resume"] button')
  await wait(`document.querySelectorAll('[data-testid="resume-chip"]').length === 0`)

  // Another provider becomes active: the action still points at the one that failed.
  await command('provider_use', { reference: 'otra-cuenta' })
  await clickText('Revisar uso y límites', 'button')
  await wait(`[...document.querySelectorAll('[role="tab"][aria-selected="true"]')].some(t=>t.textContent==='Uso y límites')`)
  const card = await evaluate(`(() => {const tab=[...document.querySelectorAll('[role="tab"][aria-selected="true"]')].find(t=>t.textContent==='Uso y límites');const section=tab.closest('[data-anchor]');return {anchor:section.dataset.anchor,title:section.querySelector('h2').innerText,open:document.querySelectorAll('[role="tab"][aria-selected="true"]').length}})()`)
  assert.match(card.title, /prueba-local/)
  assert.doesNotMatch(card.title, /otra-cuenta/)
  assert.equal(card.open, 1, 'only that card is open')
  await screenshot('usage-tab')

  await click('button[aria-label="Volver"]')
  await wait(`Boolean(document.querySelector('[data-failure="quota"]'))`)
  report({ passed: ['quota failure explained with the provider message', 'armed resume shows in the title bar and the sidebar, and goes on cancel', 'action opens the failing provider usage tab while another is active', 'back returns to the conversation'] })
}, { width: 1400, height: 900 })

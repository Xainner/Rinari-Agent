// Desactivar un proveedor (plan 0.4.0 #97). Desde Ajustes > Proveedores, el
// interruptor de la tarjeta abre un diálogo que dice qué depende de él (es el
// activo y lo usa un agente) y deja elegir el reemplazo. Al confirmar, el
// agente y el modelo activo pasan al reemplazo, sus modelos salen de la lista
// y la tarjeta queda al final como «Desactivado». Una conversación que lo
// seguía usando no falla a ciegas: la tarjeta lo dice y «Activar» lo vuelve a
// encender.
const assert = require('node:assert/strict')
const { click, clickText, command, evaluate, input, menuShortcut, reload, report, scenario, screenshot, settleAnimations, useLocalModel, wait } = require('../harness.cjs')

scenario(async () => {
  await useLocalModel()
  await command('provider_create', { alias: 'reserva', provider_type: 'custom', auth_method: 'none', endpoint: 'http://127.0.0.1:9/v1' })
  const spare = (await command('model_add', { provider: 'reserva', provider_model_id: 'reserva-modelo', alias: 'reserva-modelo' })).model
  const local = (await command('model_list', {})).models.find((m) => m.provider === 'prueba-local')
  const agent = (await command('agent_list')).agents[0].name
  await command('agent_config_set', { agent, model: local.id })
  const sessionId = (await command('session_create', { chat: true, title: 'Proveedor apagado' })).session.id
  await command('session_model_set', { reference: sessionId, model: local.id, provider: 'prueba-local' })
  await reload()

  await menuShortcut('settings', 'CmdOrCtrl+,')
  await clickText('Proveedores', 'nav button')
  await wait(`document.querySelectorAll('[data-testid="provider-enabled"]').length===2`)
  await click('[data-anchor="provider:' + (await command('provider_get', { reference: 'prueba-local' })).provider.id + '"] [data-testid="provider-enabled"]')
  await wait(`Boolean(document.querySelector('[data-testid="disable-provider-deps"]'))`)
  const deps = await evaluate(`document.querySelector('[data-testid="disable-provider-deps"]').innerText`)
  assert.match(deps, /Es el proveedor activo/)
  assert.match(deps, new RegExp(`Lo usan 1 agentes: ${agent}`))
  assert.equal(await evaluate(`document.querySelector('#provider-replacement').value`), spare.id)
  await settleAnimations()
  await screenshot('disable-dialog')
  await clickText('Desactivar', '[data-testid="disable-provider-dialog"] button')
  await wait(`!document.querySelector('[data-testid="disable-provider-dialog"]')`)

  const providers = (await command('provider_list')).providers
  assert.equal(providers.find((p) => p.alias === 'prueba-local').enabled, false)
  assert.equal((await command('provider_list')).active_alias, 'reserva')
  assert.deepEqual((await command('model_list', {})).models.map((m) => m.alias), ['reserva-modelo'])
  assert.equal((await command('agent_config_get', { agent })).agent.assignment.model, spare.id)
  await wait(`[...document.querySelectorAll('[data-anchor^="provider:"] h2')].at(-1)?.innerText.includes('prueba-local · Desactivado')`)
  await settleAnimations()
  await screenshot('providers-with-one-off')

  await click('button[aria-label="Volver"]')
  await clickText('Proveedor apagado', 'aside button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  await input('.composer-surface textarea', 'Hola')
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await wait(`Boolean(document.querySelector('[data-failure="disabled"]'))`)
  const alert = await evaluate(`document.querySelector('[data-failure="disabled"]').innerText`)
  assert.match(alert, /prueba-local está desactivado/)
  await screenshot('disabled-failure')
  await click('[data-testid="failure-enable-provider"]')
  await wait(`document.body.innerText.includes('prueba-local activado.')`)
  assert.equal((await command('provider_list')).providers.find((p) => p.alias === 'prueba-local').enabled, true)
  report({ passed: [
    'the dialog names the active provider and the agent that use it',
    'confirming moves the agent and the active model to the replacement',
    'its models leave model.list and the card goes last as Off',
    'an old conversation says the provider is off and turns it back on',
  ] })
}, { width: 1400, height: 900 })

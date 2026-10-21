// El modelo del chat de un agente de la Agency (dueño, 2026-10-21): se cambia
// las veces que haga falta desde el composer, el selector muestra cada cambio
// y el modelo de siempre de Rinari no se mueve. El chat del agente no está en
// session.list, así que su fila se actualiza con lo que responde el Engine.
const assert = require('node:assert/strict')
const { click, command, evaluate, reload, report, scenario, screenshot, settleAnimations, useLocalModel, wait } = require('../harness.cjs')

const CARD = '[data-testid="agency-card"]'
const PICKER = '.composer-model-controls button[title="Elegir modelo"]'

async function pick(alias) {
  await click(PICKER)
  await wait(`[...document.querySelectorAll('button')].some((b) => b.innerText.split('\\n')[0].trim() === ${JSON.stringify(alias)})`)
  await evaluate(`[...document.querySelectorAll('button')].find((b) => b.innerText.split('\\n')[0].trim() === ${JSON.stringify(alias)}).click()`)
  await wait(`document.querySelector('.composer-model-controls')?.innerText.includes(${JSON.stringify(alias)})`, 10_000)
}

scenario(async () => {
  await useLocalModel()
  for (const alias of ['prueba-b', 'prueba-c']) {
    await command('model_add', { provider: 'prueba-local', provider_model_id: `fake-${alias}`, alias })
  }
  const { agent } = await command('agency_agent_create', { agent: { name: 'Modelos' } })
  await evaluate(`localStorage.setItem('rinari.agency.tutorial.seen', JSON.stringify(['default']))`)
  await reload()

  await click(CARD)
  await wait(`document.querySelectorAll('[data-testid="agency-agent-row"]').length === 1`)
  await click('[data-testid="agency-agent-row"]')
  await wait(`Boolean(document.querySelector('[data-testid="agency-chat-greeting"]')) && Boolean(document.querySelector('.composer-model-controls'))`)
  await settleAnimations()

  // Dos cambios seguidos: el segundo también se ve (antes solo el primero).
  await pick('prueba-b')
  await pick('prueba-c')
  await pick('prueba-b')
  await screenshot('agent-chat-model')

  const opened = await command('session_open', { reference: agent.session_id })
  const models = (await command('model_list', {})).models
  const chosen = models.find((m) => m.alias === 'prueba-b')
  assert.equal(opened.session.model_id, chosen.id, `the agent chat uses the last model chosen: ${JSON.stringify(opened.session.model_id)}`)
  const active = models.find((m) => m.active)
  assert.equal(active?.alias, 'prueba-local', "Rinari's default model stays as it was")
  report({ passed: ['the agent chat model changes every time', "Rinari's default model is not touched"] })
}, { width: 1300, height: 820 })

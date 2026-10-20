// Rinari Agency (A1): la tarjeta encima de Ajustes, el tutorial de la primera
// vez (una vez por perfil), «Nuevo agente» en la vista principal, el chat
// directo del agente fuera de las conversaciones de Rinari, «Agencia»
// deshabilitada con «Pronto», «Reglas» en el panel lateral y volver a Rinari.
const assert = require('node:assert/strict')
const { click, clickText, command, evaluate, input, reload, report, scenario, screenshot, settleAnimations, useLocalModel, wait } = require('../harness.cjs')

const CARD = '[data-testid="agency-card"]'
const TUTORIAL = '[data-testid="agency-tutorial"]'
const SIDEBAR = '[data-testid="agency-sidebar"]'

scenario(async () => {
  await useLocalModel()
  const rinari = (await command('session_create', { chat: true, title: 'Charla con Rinari' })).session.id
  await reload()

  // La tarjeta, con lo que dice sin agentes (D-17).
  await wait(`Boolean(document.querySelector('${CARD}[data-mode="enter"]'))`)
  const line = await evaluate(`document.querySelector('${CARD}').innerText`)
  assert(line.includes('Crea tu primer agente'), `card says how to start: ${line}`)
  await screenshot('card')

  // Entrar: el tutorial de la primera vez (D-20).
  await click(CARD)
  await wait(`Boolean(document.querySelector('${TUTORIAL}'))`)
  await settleAnimations()
  assert(await evaluate(`document.querySelector('${TUTORIAL}').innerText.includes('Así se verá tu oficina')`), 'the office art is a preview')
  await screenshot('tutorial')
  for (let step = 0; step < 4; step++) await click('[data-testid="agency-tutorial-next"]')
  await click('[data-testid="agency-tutorial-create"]')
  await wait(`!document.querySelector('${TUTORIAL}')`)

  // La barra lateral de la Agency: Agencia deshabilitada con «Pronto» (D-21).
  await wait(`Boolean(document.querySelector('${SIDEBAR}'))`)
  const office = await evaluate(`(() => { const b = document.querySelector('[data-testid="agency-office-soon"]'); return { disabled: b.getAttribute('aria-disabled'), text: b.innerText } })()`)
  assert.equal(office.disabled, 'true')
  assert(office.text.includes('Pronto'))
  assert.equal(await evaluate(`Boolean(document.querySelector('.view-switcher'))`), false, 'no Normal | Boards inside the Agency')

  // «Nuevo agente» en la vista principal (D-16).
  await wait(`Boolean(document.querySelector('[data-testid="agency-agent-form"]'))`)
  await screenshot('form')
  await input('[data-testid="agency-form-name"]', 'Emails')
  await clickText('Solo lectura', '[data-testid="agency-agent-form"] button')
  await click('[data-testid="agency-form-submit"]')

  // Su chat directo se abre; «Reglas» está en el panel lateral.
  await wait(`document.querySelectorAll('[data-testid="agency-agent-row"]').length === 1`)
  await wait(`Boolean(document.querySelector('.dock-view-button[data-view="rules"]'))`)
  const [agent] = (await command('agency_agent_list', { rinari_profile_id: 'active' })).agents
  assert.equal(agent.name, 'Emails')
  assert.equal(agent.permission_profile, 'read-only')
  await click('.dock-view-button[data-view="rules"]')
  await wait(`Boolean(document.querySelector('[data-testid="agency-rules"]'))`)
  await settleAnimations()
  await screenshot('agent-chat-rules')

  // El chat del agente no está entre las conversaciones de Rinari.
  const listed = (await command('session_list', {})).sessions.map((s) => s.id)
  assert(listed.includes(rinari))
  assert(!listed.includes(agent.session_id), 'the agent chat stays out of Rinari\'s list')

  // Volver a Rinari: su barra lateral y la tarjeta con el agente.
  await click(`${CARD}[data-mode="leave"]`)
  await wait(`Boolean(document.querySelector('${CARD}[data-mode="enter"]'))`)
  await wait(`document.querySelector('${CARD}').innerText.includes('1 agente')`)
  await screenshot('back-to-rinari')

  // El tutorial no vuelve solo en este perfil.
  await click(CARD)
  await wait(`Boolean(document.querySelector('${SIDEBAR}'))`)
  assert.equal(await evaluate(`Boolean(document.querySelector('${TUTORIAL}'))`), false, 'the tutorial is shown once')
  // La página de la Agency no es una conversación: ni su título ni sus botones.
  await click('[data-testid="agency-new-agent"]')
  await wait(`Boolean(document.querySelector('[data-testid="agency-agent-form"]'))`)
  await clickText('Cancelar', '[data-testid="agency-agent-form"] button')
  await wait(`Boolean(document.querySelector('[data-testid="agency-home"]'))`)
  const top = await evaluate(`document.querySelector('.app-topbar-context')?.innerText ?? ''`)
  assert.equal(top.trim(), 'Rinari Agency', 'the top bar names the Agency')
  assert.equal(await evaluate(`Boolean(document.querySelector('.dock-view-bar'))`), false, 'no conversation buttons on an Agency page')
  await screenshot('home')

  report({
    passed: [
      'card above Settings says how to start',
      'first-run tutorial with the office preview',
      'Agencia disabled with Pronto, no Normal | Boards inside',
      'new agent in the main view, created read-only',
      'direct chat with Reglas in the side panel',
      'agent chat out of Rinari\'s list',
      'back to Rinari, card counts the agent',
      'tutorial once per profile',
      'Agency pages show the Agency in the top bar, not a conversation',
    ],
  })
})

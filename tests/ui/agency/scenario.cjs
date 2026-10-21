// Rinari Agency (A1): la tarjeta encima de Ajustes, el tutorial de la primera
// vez (una vez por perfil), «Nuevo agente» en la vista principal, el chat
// directo del agente fuera de las conversaciones de Rinari, «Agencia»
// deshabilitada con «Pronto», «Reglas» en el panel lateral y volver a Rinari.
// A2: un equipo con su oficina, una @mención que despierta a un agente en su
// puesto (con el modelo falso), un recado entregado y aceptado, «Pizarra» en el
// panel lateral del puesto y la Vía 2 con «Pronto» en Ajustes.
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

  // Escribir en el chat del agente no te saca de él (revisión de #114): la
  // sesión activa sigue siendo la del agente y su respuesta aparece ahí.
  const SEND = '.composer-surface button[aria-label="Enviar mensaje"]'
  await input('.composer-surface textarea', 'Hola, preséntate en una frase.')
  await wait(`!document.querySelector(${JSON.stringify(SEND)})?.disabled && !document.querySelector('[data-sonner-toast]')`)
  await click(SEND)
  await wait(`document.querySelector('.composer-surface textarea').value === ''`)
  await wait(`document.body.innerText.includes('listo')`, 30_000)
  await new Promise((resolve) => setTimeout(resolve, 1500)) // the list refresh after the turn
  const selected = await evaluate(`document.querySelector('[data-testid="agency-agent-row"][aria-current="page"]')?.innerText ?? ''`)
  assert(selected.includes('Emails'), 'the agent stays selected after writing to it')
  assert.equal(await evaluate(`Boolean(document.querySelector('.dock-view-button[data-view="rules"]'))`), true, 'still in the agent chat')
  const history = await command('session_history', { session_id: agent.session_id })
  assert(history.messages.some((m) => m.role === 'user' && String(m.content).includes('preséntate')), 'the message went to the agent chat')
  assert(history.messages.some((m) => m.role === 'assistant' && String(m.content).includes('listo')), 'its answer is in the agent chat')

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

  // Ajustes de la Agency (D-24): la memoria del agente y sus cuentas propias.
  await click('[data-testid="agency-settings-link"]')
  await wait(`Boolean(document.querySelector('[data-testid="agency-settings"]'))`)
  await input('[data-testid="agency-memory-topic"]', 'estilo')
  await input('[data-testid="agency-memory-text"]', 'Resúmenes de tres líneas')
  await click('[data-testid="agency-memory-add"]')
  await wait(`document.querySelectorAll('[data-testid="agency-memory-row"]').length === 1`)
  const memory = await command('agency_agent_memory_list', { agent_id: agent.id })
  assert.equal(memory.records[0].text, 'Resúmenes de tres líneas')
  assert.equal(await evaluate(`Boolean(document.querySelector('[data-testid="agency-connect-account"]'))`), true)
  await settleAnimations()
  await screenshot('settings')

  // «Detener a todos» pide confirmación y pausa sus reglas.
  await command('schedule_create', {
    task: { name: 'Revisión', kind: 'agent', schedule: { kind: 'daily', time: '08:00' }, prompt: 'Revisa', agent_id: agent.id },
  })
  await click('[data-testid="agency-stop-all"]')
  await clickText('Detener a todos', '[role="alertdialog"] button, [role="dialog"] button')
  await wait(`document.body.innerText.includes('reglas en pausa')`)
  const tasks = (await command('schedule_list', {})).tasks.filter((task) => task.agent_id === agent.id)
  assert(tasks.length === 1 && tasks[0].enabled === false, 'the agent rule is paused')

  // A2: «Nuevo equipo» con dos agentes; el primero es el jefe (D-8).
  await command('agency_agent_create', { agent: { name: 'Video' } })
  await wait(`document.querySelectorAll('[data-testid="agency-agent-row"]').length === 2`)
  await click('[data-testid="agency-new-team"]')
  await wait(`Boolean(document.querySelector('[data-testid="agency-team-form"]'))`)
  await input('[data-testid="agency-team-name"]', 'Canal infantil')
  await evaluate(`[...document.querySelectorAll('[data-testid="agency-team-members"] input[type="checkbox"]')].forEach((box) => box.click())`)
  await settleAnimations()
  await screenshot('team-form')
  await click('[data-testid="agency-team-submit"]')
  await wait(`Boolean(document.querySelector('[data-testid="agency-office"]'))`)
  await wait(`document.querySelectorAll('[data-testid="agency-post-row"]').length === 2`)
  const [team] = (await command('agency_team_list', { rinari_profile_id: 'active' })).teams
  assert.equal(team.chief_agent_id, agent.id, 'the first agent is the chief')
  assert.equal(team.posts.length, 2)
  const posts = (await command('session_list', {})).sessions.map((s) => s.id)
  assert(team.posts.every((post) => !posts.includes(post.session_id)), "posts stay out of Rinari's list")

  // Una @mención despierta a Emails en su puesto; su respuesta vuelve a la oficina (D-1).
  await input('[data-testid="agency-office-input"]', 'Hola @Emails, ¿qué hay hoy?')
  // El aviso de «equipo creado» queda encima de «Enviar» hasta que se va (anotado para el pulido).
  await wait(`!document.querySelector('[data-sonner-toast]')`)
  await click('[data-testid="agency-office-send"]')
  await wait(`[...document.querySelectorAll('[data-testid="agency-office-message"]')].some((m) => m.querySelector('img') && m.innerText.includes('Emails'))`, 30_000)
  const officeMessages = (await command('agency_office_list', { team_id: team.id })).messages
  assert.equal(officeMessages[0].author_kind, 'owner')
  assert.deepEqual(officeMessages[0].mentions, [agent.id])
  assert(officeMessages.some((m) => m.author_kind === 'agent' && m.agent_id === agent.id && m.hop === 1), 'the post answered one hop further')

  // Un recado sin destinatario va al jefe, corre como un turno y se entrega (D-3, Vía 1).
  await click('[data-testid="agency-office-errand"]')
  await input('[data-testid="agency-errand-title"]', 'Resumen del día')
  await input('[data-testid="agency-errand-checks"]', 'Tres líneas')
  await click('[data-testid="agency-errand-submit"]')
  await wait(`Boolean(document.querySelector('[data-testid="agency-errand"][data-status="delivered"] [data-testid="agency-errand-accept"]'))`, 30_000)
  await settleAnimations()
  await screenshot('office')
  await click('[data-testid="agency-errand-accept"]')
  await wait(`Boolean(document.querySelector('[data-testid="agency-errand"][data-status="reviewed"]'))`)
  const [done] = (await command('agency_errand_list', { team_id: team.id })).errands
  assert.equal(done.status, 'reviewed')
  assert.deepEqual(done.done_when, ['Tres líneas'])

  // El puesto es una conversación con «Pizarra» en su panel lateral (D-14).
  await clickText('Emails', '[data-testid="agency-post-row"]', { includes: true })
  await wait(`Boolean(document.querySelector('.dock-view-button[data-view="board"]'))`)
  assert.equal(await evaluate(`Boolean(document.querySelector('.dock-view-button[data-view="rules"]'))`), false, 'Reglas is for the direct chat')
  await click('.dock-view-button[data-view="board"]')
  await wait(`Boolean(document.querySelector('[data-testid="agency-board"] [data-testid="agency-errand"]'))`)
  await settleAnimations()
  await screenshot('post-board')

  // Ajustes: el equipo y toda la Agency, con la Vía 2 todavía «Pronto» (D-28).
  await click('[data-testid="agency-settings-link"]')
  await wait(`Boolean(document.querySelector('[data-testid="agency-settings-scope-agency"]'))`)
  await click('[data-testid="agency-settings-scope-agency"]')
  await wait(`Boolean(document.querySelector('[data-testid="agency-errand-mode-subagents"]'))`)
  const later = await evaluate(`(() => { const b = document.querySelector('[data-testid="agency-errand-mode-subagents"]'); return { disabled: b.getAttribute('aria-disabled'), text: b.innerText } })()`)
  assert.equal(later.disabled, 'true')
  assert(later.text.includes('Pronto'))
  const agencySettings = await command('agency_settings_get', {})
  assert.equal(agencySettings.errand_mode, 'turn')
  await settleAnimations()
  await screenshot('settings-agency')

  report({
    passed: [
      'card above Settings says how to start',
      'first-run tutorial with the office preview',
      'Agencia disabled with Pronto, no Normal | Boards inside',
      'new agent in the main view, created read-only',
      'direct chat with Reglas in the side panel',
      'writing in the agent chat keeps it selected and its answer there',
      'agent chat out of Rinari\'s list',
      'back to Rinari, card counts the agent',
      'tutorial once per profile',
      'Agency pages show the Agency in the top bar, not a conversation',
      'Agency settings: the agent memory is written and listed, accounts can be connected',
      'stop everyone asks and pauses the agent rules',
      "new team with two agents, the first is the chief, posts out of Rinari's list",
      'an @mention wakes the agent in its post and its answer comes back to the office',
      'an errand to nobody goes to the chief, is delivered and accepted',
      'Pizarra in the post side panel',
      'Agency settings: subagents shown as Pronto, errands run as turns',
    ],
  })
})

// Rinari Agency (A1): la tarjeta encima de Ajustes, el tutorial de la primera
// vez (una vez por perfil), «Nuevo agente» en la vista principal, el chat
// directo del agente fuera de las conversaciones de Rinari, «Agencia»
// deshabilitada con «Pronto», «Reglas» en el panel lateral y volver a Rinari.
// A2: un equipo con su oficina, una @mención que despierta a un agente en su
// puesto (con el modelo falso), un recado entregado y aceptado, «Pizarra» en el
// panel lateral del puesto y la Vía 2 con «Pronto» en Ajustes.
const assert = require('node:assert/strict')
const { until, click, clickText, command, evaluate, input, reload, report, scenario, screenshot, settleAnimations, ui, useLocalModel, wait } = require('../harness.cjs')

// Sonner pauses its toasts while the pointer is over them: the last click can
// leave it there, so the wait for them to go first moves it away.
const pointerAway = () => ui.win.webContents.sendInputEvent({ type: 'mouseMove', x: 5, y: 400 })

const CARD = '[data-testid="agency-card"]'
/** Ningún toast tapa la caja del selector (el composer y su «Enviar»). */
const toastClearOf = (selector) => evaluate(`(() => {
  const target = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect()
  if (!target) return true
  return [...document.querySelectorAll('[data-sonner-toast]')].every((toast) => {
    const r = toast.getBoundingClientRect()
    return r.width === 0 || r.right <= target.left || r.left >= target.right || r.bottom <= target.top || r.top >= target.bottom
  })
})()`)
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
  // Cada paso con su pose y lo que cuenta; el último es una elección (D-20).
  for (let step = 2; step <= 5; step++) {
    await click('[data-testid="agency-tutorial-next"]')
    await wait(`document.querySelectorAll('${TUTORIAL} .welcome-figure img[data-on]').length === 1`)
    await settleAnimations()
    if (step < 5) assert(await evaluate(`document.querySelectorAll('${TUTORIAL} .agency-tour-points li').length >= 3`), `step ${step} explains itself`)
    assert.equal(await evaluate(`document.querySelectorAll('${TUTORIAL} .welcome-title').length`), 1, `step ${step} shows one title`)
    await screenshot(`tutorial-${step}`)
  }
  const choices = await evaluate(`[...document.querySelectorAll('${TUTORIAL} .agency-tour-choice')].map((b) => ({ text: b.innerText, disabled: b.disabled }))`)
  assert.equal(choices.length, 3, 'create, template or later')
  assert(!choices[1].disabled && choices[1].text.includes('plantilla'), `the Engine ships templates: the choice is open (${JSON.stringify(choices[1])})`)
  await click('[data-testid="agency-tutorial-create"]')
  await wait(`!document.querySelector('${TUTORIAL}')`)

  // La barra lateral de la Agency: Agencia deshabilitada con «Pronto» (D-21).
  await wait(`Boolean(document.querySelector('${SIDEBAR}'))`)
  const office = await evaluate(`(() => { const b = document.querySelector('[data-testid="agency-office-soon"]'); return { disabled: b.getAttribute('aria-disabled'), text: b.innerText } })()`)
  assert.equal(office.disabled, 'true')
  assert(office.text.includes('Pronto'))
  assert.equal(await evaluate(`Boolean(document.querySelector('.view-switcher'))`), false, 'no Normal | Boards inside the Agency')

  // «Nuevo agente» en la vista principal (D-16); con «Créalo con Rinari», su frase lista para escribir.
  await wait(`Boolean(document.querySelector('[data-testid="agency-agent-form"]'))`)
  if (await evaluate(`Boolean(document.querySelector('[data-testid="agency-draft-input"]'))`)) {
    await wait(`document.activeElement?.dataset.testid === 'agency-draft-input'`)
  }
  await screenshot('form')
  await input('[data-testid="agency-form-name"]', 'Emails')
  // La autonomía es una elección en tarjetas, y el modelo el selector del composer (card «Agency», puntos 1 y 2).
  assert(await evaluate(`Boolean(document.querySelector('[data-testid="agency-form-model"] .agency-model-field button'))`), 'the model is chosen with the composer picker')
  await click('[data-testid="agency-form-autonomy"] [data-value="read-only"]')
  // El avatar se elige entre los aprobados (punto 7) y el esfuerzo va junto al modelo (punto 1).
  assert(await evaluate(`Boolean(document.querySelector('[data-testid="agency-form-effort"] button'))`), 'the effort picker sits next to the model')
  await click('[data-testid="agency-form-avatar"]')
  await wait(`Boolean(document.querySelector('.agency-avatar-option[data-icon="code"]'))`)
  await settleAnimations()
  await screenshot('form-avatar')
  await click('.agency-avatar-option[data-icon="code"]')
  await wait(`!document.querySelector('.agency-avatar-option')`)
  await click('[data-testid="agency-form-submit"]')

  // Su chat directo se abre vacío con su nombre y su saludo, no los de Rinari;
  // el aviso de «listo» no tapa el composer.
  await wait(`document.querySelectorAll('[data-testid="agency-agent-row"]').length === 1`)
  await wait(`document.querySelector('[data-testid="agency-chat-greeting"]')?.innerText.includes('Emails')`)
  assert(await evaluate(`document.querySelector('[data-testid="agency-chat-title"]')?.innerText.includes('Emails')`), 'the title bar names the agent before the first message')
  assert.equal(await evaluate(`Boolean(document.querySelector('.home-suggestions'))`), false, "no Rinari suggestions in an agent's chat")
  assert.equal(await evaluate(`document.querySelector('.home-art img')?.getAttribute('src')?.includes('/brand/home.webp')`), false, 'the Agency chat has its own art')
  await wait(`Boolean(document.querySelector('[data-sonner-toast]'))`)
  await until(() => toastClearOf('.composer-surface'), 'the toast leaves the composer free', 3000)
  await settleAnimations()
  await screenshot('agent-chat-empty')
  await wait(`Boolean(document.querySelector('.dock-view-button[data-view="rules"]'))`)
  const [agent] = (await command('agency_agent_list', { rinari_profile_id: 'active' })).agents
  assert.equal(agent.name, 'Emails')
  assert.equal(agent.permission_profile, 'read-only')
  assert.equal(agent.icon, 'code', 'the chosen avatar is saved with the agent')
  await click('.dock-view-button[data-view="rules"]')
  await wait(`Boolean(document.querySelector('[data-testid="agency-rules"]'))`)
  await settleAnimations()
  await screenshot('agent-chat-rules')

  // Escribir en el chat del agente no te saca de él (revisión de #114): la
  // sesión activa sigue siendo la del agente y su respuesta aparece ahí.
  const SEND = '.composer-surface button[aria-label="Enviar mensaje"]'
  await input('.composer-surface textarea', 'Hola, preséntate en una frase.')
  pointerAway()
  await wait(`!document.querySelector(${JSON.stringify(SEND)})?.disabled && !document.querySelector('[data-sonner-toast]')`)
  await click(SEND)
  await wait(`document.querySelector('.composer-surface textarea').value === ''`)
  await wait(`document.body.innerText.includes('listo')`, 30_000)
  await new Promise((resolve) => setTimeout(resolve, 1500)) // the list refresh after the turn
  const selected = await evaluate(`document.querySelector('[data-testid="agency-agent-row"][aria-current="page"]')?.innerText ?? ''`)
  assert(selected.includes('Emails'), 'the agent stays selected after writing to it')
  assert.equal(await evaluate(`Boolean(document.querySelector('.dock-view-button[data-view="rules"]'))`), true, 'still in the agent chat')
  const history = await command('session_history', { reference: agent.session_id })
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
  // «+» ofrece un equipo en blanco o una plantilla.
  await click('[data-testid="agency-new-team"]')
  await click('[data-testid="agency-new-team-blank"]')
  await wait(`Boolean(document.querySelector('[data-testid="agency-team-form"]'))`)
  await input('[data-testid="agency-team-name"]', 'Canal infantil')
  await evaluate(`[...document.querySelectorAll('[data-testid="agency-team-members"] input[type="checkbox"]')].forEach((box) => box.click())`)
  await settleAnimations()
  await screenshot('team-form')
  // Un aviso que sigue a la vista no tapa el pie de la ficha (se vuelve a mirar al cambiar de página).
  await wait(`(() => { const target = document.querySelector('[data-testid="agency-team-submit"]').getBoundingClientRect(); return [...document.querySelectorAll('[data-sonner-toast]')].every((toast) => { const r = toast.getBoundingClientRect(); return r.width === 0 || r.bottom <= target.top || r.top >= target.bottom || r.right <= target.left || r.left >= target.right }) })()`)
  await click('[data-testid="agency-team-submit"]')
  await wait(`Boolean(document.querySelector('[data-testid="agency-office"]'))`)
  await wait(`document.querySelectorAll('[data-testid="agency-post-row"]').length === 2`)
  const [team] = (await command('agency_team_list', { rinari_profile_id: 'active' })).teams
  assert.equal(team.chief_agent_id, agent.id, 'the first agent is the chief')
  assert.equal(team.posts.length, 2)
  const posts = (await command('session_list', {})).sessions.map((s) => s.id)
  assert(team.posts.every((post) => !posts.includes(post.session_id)), "posts stay out of Rinari's list")

  // La oficina usa el panel lateral de una conversación: Recado, Pizarra, Trabajo y Ficha en la barra de título (punto 5).
  const officeViews = await evaluate(`[...document.querySelectorAll('.dock-view-bar .dock-view-button')].map((b) => b.dataset.view)`)
  assert.deepEqual(officeViews, ['errand', 'board', 'work', 'team'], `office side panel views (${officeViews})`)
  // La lista de @ sale pegada al composer y con su ancho, sin salirse (punto 3).
  await input('[data-testid="agency-office-input"]', 'Hola @Em')
  await wait(`Boolean(document.querySelector('[data-testid="agency-mention-list"]'))`)
  const fit = await evaluate(`(() => { const list = document.querySelector('[data-testid="agency-mention-list"]').getBoundingClientRect(); const box = document.querySelector('.office-composer').getBoundingClientRect(); return { left: list.left - box.left, right: box.right - list.right } })()`)
  assert(Math.abs(fit.left) <= 1 && Math.abs(fit.right) <= 1, `the @ list keeps the composer's width (${JSON.stringify(fit)})`)
  await settleAnimations()
  await screenshot('office-mention')
  // Una @mención despierta a Emails en su puesto; su respuesta vuelve a la oficina (D-1).
  await input('[data-testid="agency-office-input"]', 'Hola @Emails, ¿qué hay hoy?')
  // Mientras se escribe, la @mención se ve como mención (punto 4).
  await wait(`document.querySelector('.office-input-mention')?.textContent === '@Emails'`)
  // El aviso de «equipo creado» ya no tapa «Enviar»: la pila sube sobre el composer.
  await until(() => toastClearOf('.office-composer'), 'the toast leaves the office composer free', 3000)
  await click('[data-testid="agency-office-send"]')
  await wait(`[...document.querySelectorAll('[data-testid="agency-office-message"]:not(.is-owner)')].some((m) => m.querySelector('.agency-office-avatar img') && m.innerText.includes('Emails'))`, 30_000)
  const officeMessages = (await command('agency_office_list', { team_id: team.id })).messages
  assert.equal(officeMessages[0].author_kind, 'owner')
  assert.deepEqual(officeMessages[0].mentions, [agent.id])
  assert(officeMessages.some((m) => m.author_kind === 'agent' && m.agent_id === agent.id && m.hop === 1), 'the post answered one hop further')

  // La mención en el mensaje enviado es una pastilla con el avatar de quien se nombra, dentro de su burbuja.
  await wait(`Boolean(document.querySelector('[data-testid="agency-office-message"] .agency-mention .agent-avatar'))`)

  // Un recado sin destinatario va al jefe, corre como un turno y se entrega (D-3, Vía 1); se deja desde el panel lateral.
  await click('.dock-view-button[data-view="errand"]')
  await wait(`Boolean(document.querySelector('[data-dock-view="errand"] [data-testid="agency-errand-form"]'))`)
  await input('[data-testid="agency-errand-title"]', 'Resumen del día')
  await input('[data-testid="agency-errand-checks"]', 'Tres líneas')
  await until(() => toastClearOf('[data-testid="agency-errand-submit"]'), 'the toast leaves «Dejar el recado» free', 3000)
  await settleAnimations()
  await screenshot('office-errand')
  await click('[data-testid="agency-errand-submit"]')
  await wait(`!document.querySelector('[data-dock-view="errand"]')`)
  await wait(`Boolean(document.querySelector('[data-testid="agency-errand"][data-status="delivered"] [data-testid="agency-errand-accept"]'))`, 30_000)
  await settleAnimations()
  await screenshot('office')
  // Pizarra y Ficha, una sobre otra en el mosaico del panel.
  await click('.dock-view-button[data-view="board"]')
  await click('.dock-view-button[data-view="team"]')
  await wait(`Boolean(document.querySelector('[data-dock-view="board"] [data-testid="agency-board"]')) && Boolean(document.querySelector('[data-dock-view="team"] [data-testid="agency-team-card"]'))`)
  await settleAnimations()
  await screenshot('office-dock')
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

  // Colapsar la barra en la Agency: un riel de iconos como el de Rinari, sin texto partido.
  const TOGGLE = '.app-topbar-leading .app-topbar-icon'
  await click(TOGGLE)
  await wait(`Boolean(document.querySelector('[data-testid="agency-sidebar"][data-rail="true"]'))`)
  await settleAnimations()
  const rail = await evaluate(`(() => {
    const el = document.querySelector('[data-testid="agency-sidebar"][data-rail="true"]')
    return {
      switch: Boolean(el.querySelector('.agency-view-switch')),
      text: [...el.querySelectorAll('p, .truncate')].map((node) => node.textContent.trim()).filter(Boolean),
      agents: el.querySelectorAll('[data-testid="agency-agent-row"] .agent-avatar').length,
      teams: el.querySelectorAll('[data-testid="agency-team-office"]').length,
      overflow: el.scrollWidth - el.clientWidth,
      labels: [...el.querySelectorAll('button')].every((button) => button.getAttribute('aria-label')),
    }
  })()`)
  assert.equal(rail.switch, false, 'no Normal | Agencia pill in the rail')
  assert.deepEqual(rail.text, [], `no text in the rail (${rail.text})`)
  assert.equal(rail.agents, 2, 'one avatar per agent')
  assert.equal(rail.teams, 1, 'one icon per team')
  assert(rail.overflow <= 0, `nothing spills sideways (${rail.overflow})`)
  assert(rail.labels, 'every rail button has its name as a label')
  await screenshot('rail')
  // Un avatar del riel abre el chat de su agente.
  await click('[data-testid="agency-sidebar"][data-rail="true"] [data-testid="agency-agent-row"][aria-label^="Emails"]')
  await wait(`document.querySelector('[data-testid="agency-agent-row"][aria-label^="Emails"]')?.getAttribute('aria-current') === 'page'`)
  // Expandir: la barra completa vuelve.
  await click(TOGGLE)
  await wait(`Boolean(document.querySelector('[data-testid="agency-sidebar"]:not([data-rail]) .agency-view-switch'))`)
  await settleAnimations()
  await screenshot('rail-expanded')

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
      'collapsed Agency sidebar is an icon rail (avatars, teams, actions) and expands back',
      'stop everyone asks and pauses the agent rules',
      "new team with two agents, the first is the chief, posts out of Rinari's list",
      'an @mention wakes the agent in its post and its answer comes back to the office',
      'an errand to nobody goes to the chief, is delivered and accepted',
      'Pizarra in the post side panel',
      'Agency settings: subagents shown as Pronto, errands run as turns',
    ],
  })
})

// Presencia: la conversación continua con Rinari. Se enciende en Ajustes, no
// sale entre los chats, la app se abre en ella, se le habla ahí mismo, «Entrar»
// la pone a pantalla completa con su panel y no se puede cerrar.
const assert = require('node:assert/strict')
const { click, clickText, command, delay, evaluate, input, menuShortcut, report, scenario, screenshot, until, useLocalModel, wait } = require('../harness.cjs')

const SWITCH = '[data-testid="presence-settings"] button[role="switch"]'
const has = (selector) => `Boolean(document.querySelector(${JSON.stringify(selector)}))`
const presence = async () => (await command('presence_get')).presence
const chatIds = async () => (await command('session_list', {})).sessions.map((row) => row.id)

async function send(text) {
  await wait(has('.composer-surface textarea'))
  await input('.composer-surface textarea', text)
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
}

scenario(async () => {
  await useLocalModel()
  assert.deepEqual(await presence(), { enabled: false, session: null }, 'off by default')
  assert.equal(await evaluate(has('[data-testid="sidebar-presence"]')), false, 'no entry while off')

  // Ajustes → Presencia: encenderla.
  await menuShortcut('settings', 'CmdOrCtrl+,')
  await clickText('Presencia', 'nav button')
  await wait(has(SWITCH))
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(SWITCH)}).getAttribute('aria-checked')`), 'false')
  await screenshot('settings-off')
  await click(SWITCH)
  await until(async () => (await presence()).enabled === true, 'the Engine stores it on')
  await wait(`document.querySelector(${JSON.stringify(SWITCH)}).getAttribute('aria-checked') === 'true'`)
  await screenshot('settings-on')
  const session = (await presence()).session
  assert.equal(session.lineage_kind, 'presence')
  assert.equal(session.permission_profile, 'full-access')
  assert.equal((await chatIds()).includes(session.id), false, 'it is not one of the chats')

  // Al volver, la app está en ella: su cabecera, su entrada en la barra lateral.
  await click('button[aria-label="Volver"]')
  await wait(has('[data-testid="presence-stage"]'))
  await wait(`document.querySelector('[data-testid="sidebar-presence"]')?.getAttribute('aria-current') === 'page'`)
  assert.equal(await evaluate(`document.querySelector('[data-testid="presence-status"]').textContent`), 'Todo en calma')
  await screenshot('home-empty')

  // Se le habla ahí mismo, y sigue sin ser un chat.
  await send('¿Cómo va todo?')
  await wait(`document.querySelector('.conversation-enter')?.innerText.includes('AQUÍ ESTOY')`)
  await until(async () => !(await chatIds()).includes(session.id), 'still absent from the chats after a turn')
  assert.equal((await presence()).session.id, session.id, 'the same conversation')
  assert.equal(await evaluate(`[...document.querySelectorAll('.concept-sidebar *')].some((node) => node.children.length === 0 && node.textContent.trim() === '¿Cómo va todo?')`), false, 'no row for it among the chats')
  await screenshot('home-conversation')

  // «Entrar»: pantalla completa, sin la barra lateral, con su panel.
  await click('[data-testid="presence-full-toggle"]')
  await wait(has('[data-testid="presence-panel"]'))
  await wait(`!document.querySelector('.app-sidebar')`)
  assert.equal(await evaluate(`document.querySelector('[data-testid="presence-waiting"]').innerText.includes('Nada espera tu respuesta.')`), true)
  assert.equal(await evaluate(`document.querySelector('.conversation-enter')?.innerText.includes('AQUÍ ESTOY')`), true, 'the conversation stays')
  await delay(400)
  await screenshot('full')
  await click('[data-testid="presence-full-toggle"]')
  await wait(has('.app-sidebar'))
  assert.equal(await evaluate(has('[data-testid="presence-panel"]')), false)

  // No se cierra: Ctrl+W la deja como está.
  await menuShortcut('close-session', 'CmdOrCtrl+W')
  await delay(400)
  assert.equal(await evaluate(has('[data-testid="presence-stage"]')), true)
  const refused = await command('session_close', { ref: session.id }).then(() => null, (error) => error)
  assert(refused, 'the Engine refuses to close it')

  // «Nueva conversación» es un chat normal; su entrada la trae de vuelta, con lo dicho.
  await menuShortcut('new-chat', 'CmdOrCtrl+N')
  await wait(`!document.querySelector('[data-testid="presence-stage"]')`)
  await screenshot('new-chat')
  await click('[data-testid="sidebar-presence"]')
  await wait(has('[data-testid="presence-stage"]'))
  await wait(`document.querySelector('.conversation-enter')?.innerText.includes('AQUÍ ESTOY')`)

  // Apagarla la quita de la vista sin borrarla; encenderla trae la misma.
  await menuShortcut('settings', 'CmdOrCtrl+,')
  await clickText('Presencia', 'nav button')
  await wait(has(SWITCH))
  await click(SWITCH)
  await until(async () => (await presence()).enabled === false, 'off again')
  await click('button[aria-label="Volver"]')
  await wait(`!document.querySelector('[data-testid="sidebar-presence"]')`)
  assert.equal(await evaluate(has('[data-testid="presence-stage"]')), false, 'no header while off')
  await command('presence_set', { enabled: true })
  assert.equal((await presence()).session.id, session.id, 'turning it on finds the same conversation')

  report({ passed: [
    'off by default, with no entry',
    'the switch stores the mode in the Engine',
    'the conversation is not one of the chats',
    'the app opens on it after turning it on',
    'a message is answered in place',
    'Entrar shows the panel without the sidebar, Salir restores it',
    'it cannot be closed',
    'a new chat is a normal chat and the entry comes back to it',
    'turning it off keeps the conversation',
  ] })
}, { width: 1400, height: 900 })

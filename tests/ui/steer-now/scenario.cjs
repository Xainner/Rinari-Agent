// Comandos largos y «Enviar ahora» con el Engine real (plan 0.4.0 #31, #32, #90):
// 1. Rinari corre un comando que no termina; su fila ofrece «Mover a segundo
//    plano» y pulsarlo lo deja corriendo como proceso del chat: el turno sigue.
// 2. Mientras Rinari va a escribir, Ctrl+Enter manda un mensaje «ahora»: la
//    respuesta en curso se corta y el turno lee el mensaje en el paso
//    siguiente. La burbuja dice «Interrumpió el paso».
// 3. El proceso sigue vivo en la conversación, con su nombre de comando.
const assert = require('node:assert/strict')
const { click, clickText, command, evaluate, input, key, reload, report, scenario, screenshot, settleAnimations, ui, until, useLocalModel, wait } = require('../harness.cjs')

const BACKGROUND = '[data-testid="tool-to-background"]'
const text = (value) => `document.body.innerText.includes(${JSON.stringify(value)})`
const pending = () => fetch(new URL('/__pending?lane=main', ui.model)).then((r) => r.json())
async function release() {
  await until(async () => await pending() > 0, 'model waits for the next step')
  assert.equal(await fetch(new URL('/__release?lane=main', ui.model)).then((r) => r.json()), true)
}

scenario(async () => {
  await useLocalModel()
  const { session } = await command('session_create', { chat: true, title: 'Servidor', permission_profile: 'full-access' })
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Servidor', 'aside li button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')

  // 1. A command that never ends: move it to the background.
  await input('.composer-surface textarea', 'Arranca el servidor')
  await click('.composer-surface textarea')
  await key('Enter')
  await release() // shell.exec in the foreground
  await wait(`Boolean(document.querySelector('${BACKGROUND}'))`)
  await settleAnimations()
  await screenshot('foreground-command')
  await click(BACKGROUND)
  await wait(`document.querySelector('${BACKGROUND}') === null`)

  // 2. The next answer is held: «send now» cuts it before it is written.
  await until(async () => await pending() > 0, 'the turn went on after the command moved')
  await input('.composer-surface textarea', 'Para: el puerto es el 8099')
  await click('.composer-surface textarea')
  await key('Enter', ['control'])
  await wait(`document.querySelector('[data-testid="steer-message"]')?.dataset.interrupted === 'true'`)
  await release() // the answer that gets cut
  await release() // the answer after reading the message
  await wait(text('LEÍ EL PUERTO'))
  await wait(text('Interrumpió el paso'))
  assert.equal(await evaluate(text('TEXTO QUE NO SE VE')), false, 'the cut answer is not written')
  await settleAnimations()
  await screenshot('sent-now')

  // 3. The command is still running, as a process of this conversation.
  const listed = await command('workspace_process_list', { session_id: session.id })
  const running = listed.processes.filter((row) => row.running && row.kind === 'process')
  assert.equal(running.length, 1, `one process still running (${JSON.stringify(listed.processes)})`)
  assert.match(running[0].command, /servidor-de-prueba/)
  await command('workspace_process_stop', { session_id: session.id, id: running[0].id })
  report({ passed: ['move to background keeps it running and the turn goes on', 'Ctrl+Enter cuts the answer and is read now', 'bubble says it interrupted the step'] })
}, { width: 1280, height: 860 })

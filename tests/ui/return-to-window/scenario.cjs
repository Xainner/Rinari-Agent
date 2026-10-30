// #62: un resultado que termina con la ventana sin atención no se da por
// leído al volver en medio segundo: espera a un gesto del dueño (o a unos
// segundos). El número del título baja en ese momento.
const assert = require('node:assert/strict')
const { ui, clickText, click, command, delay, evaluate, input, reload, report, scenario, screenshot, until, useLocalModel, wait, wheel, center } = require('../harness.cjs')

const origin = () => ui.model.replace(/\/v1$/, '')

scenario(async () => {
  await useLocalModel()
  // Sin notificaciones del sistema durante la prueba: no deben salir en el escritorio de quien la corre.
  await evaluate(`localStorage.setItem('rinari.notifications.prefs.v1', JSON.stringify({ toasts: true, system: false, needsYou: true, planReady: true, showContent: true }))`)
  await command('session_create', { chat: true, title: 'Informe del mes' })
  await reload()
  await clickText('Informe del mes', 'aside button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  await input('.composer-surface textarea', 'Resume el informe del mes')
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await until(async () => (await (await fetch(origin() + '/__pending')).json()) === true, 'the turn reaches the held model request')

  // El dueño se va a otra ventana.
  ui.win.blur()
  await wait('!document.hasFocus()')
  await fetch(origin() + '/__release')
  await wait(`document.body.innerText.includes('El informe del mes está listo.')`)
  await wait(`document.title === '(1) Rinari Agent'`)

  // Vuelve: el resultado está a la vista, pero sin un gesto no cuenta como leído enseguida.
  ui.win.focus()
  await wait('document.hasFocus()')
  await delay(1200)
  assert.equal(await evaluate('document.title'), '(1) Rinari Agent', 'not read 500 ms after coming back')
  await screenshot('back-unread')

  // Un gesto con el resultado a la vista lo da por visto.
  const { x, y } = await center('[data-testid="turn-result"]')
  await wheel(x, y, -1)
  await wait(`document.title === 'Rinari Agent'`)
  report({ passed: [
    'a result that finished while away is not read half a second after coming back',
    'a gesture with the result in view reads it and clears the count',
  ] })
}, { width: 1400, height: 900 })

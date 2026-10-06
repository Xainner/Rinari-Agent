// Una respuesta que termina en otro chat de Normal (no en Boards) mientras
// miras otro cuenta como chat pendiente: el título pasa a «(1) Rinari Agent»,
// la misma cuenta que va al icono de la barra de tareas y a la bandeja.
// Trabajar no cuenta; abrir el chat y ver el resultado lo baja a cero.
const assert = require('node:assert/strict')
const { ui, clickText, click, command, evaluate, input, reload, report, scenario, screenshot, until, useLocalModel, wait, delay } = require('../harness.cjs')

const origin = () => ui.model.replace(/\/v1$/, '')

scenario(async () => {
  await useLocalModel()
  await command('session_create', { chat: true, title: 'Informe largo' })
  await command('session_create', { chat: true, title: 'Otra conversación' })
  await reload()
  await clickText('Informe largo', 'aside button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  await input('.composer-surface textarea', 'Revisa el informe y dime qué falta')
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await until(async () => (await (await fetch(origin() + '/__pending')).json()) === true, 'the turn reaches the held model request')

  await clickText('Otra conversación', 'aside button', { includes: true })
  await delay(600)
  assert.equal(await evaluate('document.title'), 'Rinari Agent', 'a chat that is still working is not pending')

  await fetch(origin() + '/__release')
  await wait(`document.title === '(1) Rinari Agent'`)
  await screenshot('pending-elsewhere')

  await clickText('Informe largo', 'aside button', { includes: true })
  await wait(`document.body.innerText.includes('Listo, ya revisé el informe.')`)
  await wait(`document.title === 'Rinari Agent'`)
  report({ passed: ['a result finished in another Normal chat counts as pending', 'a working chat does not count', 'reading the result clears the count'] })
}, { width: 1400, height: 900 })

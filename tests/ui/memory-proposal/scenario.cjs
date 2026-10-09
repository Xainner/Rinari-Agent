// Memoria visible: una propuesta de Rinari llega como tarjeta al chat, se
// aprueba y aparece en Ajustes > Memoria; en modo automático el siguiente
// hecho se guarda solo y «Deshacer» lo olvida.
const assert = require('node:assert/strict')
const { click, clickText, command, evaluate, input, menuShortcut, reload, report, scenario, screenshot, until, useLocalModel, wait } = require('../harness.cjs')

const FIRST = 'El servidor de pruebas escucha en 127.0.0.1:8080'
const SECOND = 'La app de ejemplo se arranca con npm run dev'
const text = (value) => `document.body.innerText.includes(${JSON.stringify(value)})`

const SEND = '.composer-surface button[aria-label="Enviar mensaje"]'
async function send(message) {
  await input('.composer-surface textarea', message)
  // Al volver de Ajustes el selector de modelos se refresca un momento, y el
  // aviso «Ajuste de memoria guardado» tapa el botón (los clics van por
  // coordenadas).
  await wait(`!document.querySelector(${JSON.stringify(SEND)})?.disabled && !document.querySelector('[data-sonner-toast]')`)
  await click(SEND)
  await wait(`document.querySelector('.composer-surface textarea').value === ''`)
}

async function records() {
  return (await command('memory_list', { scope: 'all' })).records.map((record) => record.text)
}

scenario(async () => {
  await useLocalModel()
  const session = (await command('session_create', { chat: true, title: 'Memoria' })).session.id
  assert.equal((await command('memory_settings_get')).learned_facts, 'ask')
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Memoria', 'aside button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')

  // 1. Modo «Preguntar»: tarjeta en el chat, nada guardado hasta aprobar.
  await send('Anota el servidor de pruebas')
  await wait(`Boolean(document.querySelector('[data-testid="memory-candidate"]'))`)
  await wait(text('LISTO UNO'))
  assert.deepEqual(await records(), [], 'nothing is saved before approval')
  await screenshot('proposal')
  await clickText('Aprobar', '[data-testid="memory-candidate"] button')
  await wait(text('Aprobado: Rinari lo recordará.'))
  await until(async () => (await records()).includes(FIRST), 'approved fact is stored')

  // 2. Ajustes > Memoria lo muestra y permite pasar a Automático.
  await menuShortcut('settings', 'CmdOrCtrl+,')
  await clickText('Memoria', 'nav button')
  await wait(`[...document.querySelectorAll('[data-testid="memory-record"]')].some(el => el.textContent.includes(${JSON.stringify(FIRST)}))`)
  await screenshot('settings')
  await clickText('Automático', '[role="radiogroup"] *', { includes: true })
  await until(async () => (await command('memory_settings_get')).learned_facts === 'auto', 'setting saved as auto')

  // 3. Modo automático: se guarda solo y «Deshacer» lo olvida.
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Memoria', 'aside button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  await send('Anota cómo se arranca la app')
  await wait(`Boolean(document.querySelector('[data-testid="memory-remembered"]'))`)
  await wait(text('LISTO DOS'))
  await until(async () => (await records()).includes(SECOND), 'auto mode saves the fact')
  await screenshot('remembered')
  await clickText('Deshacer', '[data-testid="memory-remembered"] button')
  await until(async () => !(await records()).includes(SECOND), 'undo forgets it')
  assert((await records()).includes(FIRST), 'the approved fact stays')
  assert.equal(await evaluate(`document.querySelectorAll('[data-testid="memory-candidate"]').length`), 1)
  report({ session, passed: ['proposal card waits for approval', 'approved fact is listed in Settings', 'automatic mode saves and undo forgets'] })
}, { width: 1400, height: 900 })

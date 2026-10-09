// Una conversación nueva es un borrador hasta su primer mensaje: pulsar «+»
// del proyecto o «Nueva conversación» varias veces no crea sesiones; enviar
// crea una, del proyecto, con el modo elegido. En Boards, «Añadir panel» deja
// un panel borrador que pasa a ser la sesión al enviar.
const assert = require('node:assert/strict')
const { mkdirSync } = require('node:fs')
const { join } = require('node:path')
const { ui, click, clickText, command, delay, evaluate, input, reload, report, scenario, screenshot, useLocalModel, wait } = require('../harness.cjs')

const sessionCount = async () => (await command('session_list', {})).sessions.length
async function send(prefix, text) {
  await wait(`Boolean(document.querySelector(${JSON.stringify(prefix + ' .composer-surface textarea')}))`)
  await input(prefix + ' .composer-surface textarea', text)
  await click(prefix + ' .composer-surface button[aria-label="Enviar mensaje"]')
}

scenario(async () => {
  await useLocalModel()
  const root = join(ui.data, 'Proyecto Borrador'); mkdirSync(root)
  const { project } = await command('project_add', { path: root, name: 'Proyecto Borrador' })
  await reload()
  const before = await sessionCount()

  for (let i = 0; i < 3; i += 1) {
    await click('button[aria-label="Nueva sesión en Proyecto Borrador"]')
    await delay(150)
  }
  for (let i = 0; i < 2; i += 1) {
    await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Nueva conversación') && b.textContent.includes('Ctrl')).click()`)
    await delay(150)
  }
  await delay(500)
  assert.equal(await sessionCount(), before, 'opening drafts creates no session')
  await screenshot('draft-open')

  // Borrador del proyecto, en PLAN: el primer mensaje crea la sesión con ambos.
  await click('button[aria-label="Nueva sesión en Proyecto Borrador"]')
  await clickText('PLAN', '.composer-surface button')
  await send('', 'Planea la estructura del proyecto')
  await wait(`document.querySelector('.conversation-enter')?.innerText.includes('RESPUESTA DEL BORRADOR')`)
  const sessions = (await command('session_list', {})).sessions
  assert.equal(sessions.length, before + 1)
  const created = sessions.find((row) => row.project_id === project.id)
  assert(created, 'the session belongs to the project')
  assert.equal(created.mode, 'plan')
  await screenshot('draft-sent')

  // Boards: un panel borrador del proyecto.
  await click('.view-switcher button[aria-label^="Boards"]')
  await click('.board-empty-primary, button[aria-label="Añadir panel"]')
  await wait(`Boolean(document.querySelector('[role="dialog"]'))`)
  await clickText('Proyecto Borrador', '[role="dialog"] .add-pane-row', { includes: true })
  const shared = await evaluate(`Boolean(document.querySelector('[role="alertdialog"]'))`)
  if (shared) await clickText('Añadir de todos modos', '[role="alertdialog"] button')
  await wait(`Boolean(document.querySelector('[data-pane-id][data-draft]'))`)
  await delay(400)
  assert.equal(await sessionCount(), before + 1, 'a draft pane creates no session')
  const pane = await evaluate(`document.querySelector('[data-pane-id][data-draft]').getAttribute('data-pane-id')`)
  await send(`[data-pane-id="${pane}"]`, 'Hola desde el panel')
  await wait(`!document.querySelector('[data-pane-id="${pane}"][data-draft]')`)
  await wait(`document.querySelector('[data-pane-id="${pane}"]')?.innerText.includes('RESPUESTA DEL PANEL')`)
  assert.equal(await sessionCount(), before + 2)
  await screenshot('board-pane-sent')
  report({ passed: ['repeated + and new chat create nothing', 'first send creates one project session with the draft mode', 'board draft pane becomes the session on send'] })
}, { width: 1500, height: 900 })

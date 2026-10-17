// Ajustes → Personalidad (plan 0.4.0 #87) con el Engine real: las almas como
// galería, el panel con su texto en Markdown, «Duplicar para editar»,
// «Exportar» a una carpeta (su soul.toml e identity.md) e «Importar alma» de
// vuelta como alma nueva, y el aviso de un alma sin texto.
const { dialog } = require('electron')
const assert = require('node:assert/strict')
const { existsSync, mkdirSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const { ui, click, clickText, command, evaluate, input, menuShortcut, report, scenario, screenshot, settleAnimations, wait } = require('../harness.cjs')

const CARDS = '[data-testid="soul-card"]'
const PANEL = '[data-testid="soul-panel"]'
const FORM = '[data-testid="soul-form"]'
const cardNamed = (name) => `[...document.querySelectorAll('${CARDS}')].find((card) => card.querySelector('.profile-card-name')?.textContent === ${JSON.stringify(name)})`

scenario(async () => {
  const passed = []
  await menuShortcut('settings', 'CmdOrCtrl+,')
  await clickText('Personalidad', 'nav button')
  await wait(`document.querySelectorAll('${CARDS}').length >= 1`)
  assert.ok(await evaluate(`${cardNamed('Rinari')}?.textContent.includes('En uso')`), 'Rinari is in use')
  await settleAnimations()
  await screenshot('01-gallery')

  await evaluate(`${cardNamed('Rinari')}.click()`)
  await wait(`Boolean(document.querySelector('${PANEL} [data-testid="soul-panel-text"] h1, ${PANEL} [data-testid="soul-panel-text"] h2, ${PANEL} [data-testid="soul-panel-text"] p'))`)
  await settleAnimations()
  await screenshot('02-panel')
  passed.push('a card opens the soul with its text rendered')

  await clickText('Duplicar para editar', `${PANEL} button`, { includes: true })
  await wait(`document.querySelector('${FORM} #soul-name')?.value === 'Rinari (copia)'`)
  await click(`${FORM} [data-testid="soul-save"]`)
  await wait(`Boolean(${cardNamed('Rinari (copia)')})`)
  passed.push('«Duplicar para editar» makes a custom copy')

  const out = join(ui.data, 'almas'); mkdirSync(out)
  const original = dialog.showOpenDialog
  let picked = [out]
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: picked })
  try {
    await wait(`Boolean(document.querySelector('${PANEL}'))`)
    await clickText('Exportar', `${PANEL} button`, { includes: true })
    await wait(`document.body.innerText.includes('Exportada en')`)
    const folder = join(out, 'rinari-copia')
    assert.ok(existsSync(join(folder, 'soul.toml')) && existsSync(join(folder, 'identity.md')), 'soul.toml and identity.md in the folder')
    assert.match(readFileSync(join(folder, 'soul.toml'), 'utf8'), /name = "Rinari \(copia\)"/)
    passed.push('«Exportar» writes its soul.toml and identity.md')

    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    await wait(`!document.querySelector('${PANEL}')`)
    picked = [join(folder, 'soul.toml'), join(folder, 'identity.md')]
    await click('[data-testid="soul-import"]')
    await wait(`document.querySelectorAll('${CARDS}').length === 3`)
    const ids = (await command('soul_list')).souls.map((soul) => soul.id)
    assert.ok(ids.includes('rinari-copia-2'), `imported as a new soul, never over the other: ${ids}`)
    passed.push('«Importar alma» brings it back as a new soul')
  } finally {
    dialog.showOpenDialog = original
  }

  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await wait(`!document.querySelector('${PANEL}')`)
  await clickText('Crear Soul')
  await wait(`Boolean(document.querySelector('${FORM} [data-testid="soul-empty-warning"]'))`)
  await input(`${FORM} #soul-name`, 'Vacía')
  await click(`${FORM} [data-testid="soul-save"]`)
  await wait(`Boolean(${cardNamed('Vacía')})`)
  assert.equal((await command('soul_get', { id: 'vacia' })).soul.identity, '')
  await settleAnimations()
  await screenshot('03-gallery-after')
  passed.push('a soul without text is warned about and saved')
  report({ passed })
})

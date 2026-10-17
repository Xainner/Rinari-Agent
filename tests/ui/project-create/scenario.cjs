// Ventana «Nuevo proyecto» con el Engine real:
// 1. El botón de la barra abre la ventana (no el selector de carpetas).
// 2. Tres carpetas del selector (la primera principal); la que ya es de otro
//    proyecto se explica y no deja crear hasta quitarla.
// 3. «Confiar» sale encendido salvo en una carpeta que trae hooks, que sale
//    apagada con su aviso (#60).
// 4. Nombre, confiar en todas, resumen, crear: el proyecto aparece con sus
//    dos carpetas de confianza y se abre una conversación temporal del
//    proyecto, sin sesión creada (#60); el primer mensaje la crea en él.
const { dialog } = require('electron')
const assert = require('node:assert/strict')
const { mkdirSync, writeFileSync } = require('node:fs')
const { basename, join } = require('node:path')
const { click, clickText, command, evaluate, input, reload, report, scenario, screenshot, settleAnimations, useLocalModel, ui, wait } = require('../harness.cjs')

const DIALOG = '[data-testid="create-project"]'
const SUBMIT = '[data-testid="create-project-submit"]'
const ROWS = '[data-testid="create-project-row"]'

scenario(async () => {
  await useLocalModel()
  const api = join(ui.data, 'workspace', 'api')
  const web = join(ui.data, 'workspace', 'web')
  const taken = join(ui.data, 'workspace', 'viejo')
  const hooked = join(ui.data, 'workspace', 'hooks')
  for (const dir of [api, web, taken, join(hooked, '.rinari')]) mkdirSync(dir, { recursive: true })
  writeFileSync(join(hooked, '.rinari', 'hooks.json'), '[]')
  await command('project_add', { path: taken, name: 'Viejo' })
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')

  const originalDialog = dialog.showOpenDialog
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [api, web, taken, hooked] })
  try {
    // 1. The sidebar button opens the window.
    await click('aside button[aria-label="Abrir carpeta"]')
    await wait(`Boolean(document.querySelector(${JSON.stringify(DIALOG)}))`)
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(SUBMIT)}).disabled`), true)

    // 2. Folders from the picker; the taken one is explained and blocks.
    await click('[data-testid="create-project-add"]')
    await wait(`document.querySelectorAll(${JSON.stringify(ROWS)}).length === 4`)
    await wait(`document.querySelectorAll(${JSON.stringify(ROWS)})[2].innerText.includes('Ya es parte del proyecto «Viejo»')`)
    // 3. Trust starts on; the folder with hooks starts off and says why (#60).
    await wait(`Boolean(document.querySelectorAll(${JSON.stringify(ROWS)})[3].querySelector('[data-testid="create-project-commands"]'))`)
    const switches = await evaluate(`[...document.querySelectorAll(${JSON.stringify(ROWS)})].map((row) => row.querySelector('input[type=checkbox]').checked)`)
    assert.deepEqual([switches[0], switches[1], switches[3]], [true, true, false], 'trust on by default, off for the folder with hooks')
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(SUBMIT)}).disabled`), true)
    assert(await evaluate(`document.querySelectorAll(${JSON.stringify(ROWS)})[0].innerText.includes('Principal')`))
    await settleAnimations()
    await screenshot('invalid-folder')
    await evaluate(`document.querySelectorAll(${JSON.stringify(ROWS)})[2].querySelector('button[aria-label="Quitar la carpeta"]').click()`)
    await wait(`document.querySelectorAll(${JSON.stringify(ROWS)}).length === 3`)
    await evaluate(`document.querySelectorAll(${JSON.stringify(ROWS)})[2].querySelector('button[aria-label="Quitar la carpeta"]').click()`)
    await wait(`document.querySelectorAll(${JSON.stringify(ROWS)}).length === 2`)

    // 4. Name, trust, review, create.
    await input(`${DIALOG} input[aria-required="true"]`, 'Tienda')
    await clickText('Confiar en todas', `${DIALOG} button`)
    await wait(`document.querySelector('[data-testid="create-project-summary"]').innerText.includes('2 carpetas (2 de confianza)')`)
    await wait(`!document.querySelector(${JSON.stringify(SUBMIT)}).disabled`)
    await screenshot('ready')
    await click(SUBMIT)
    await wait(`!document.querySelector(${JSON.stringify(DIALOG)})`)
    await wait(`document.querySelector('aside')?.innerText.includes('Tienda')`)
  } finally {
    dialog.showOpenDialog = originalDialog
  }
  const project = (await command('project_list', {})).projects.find((p) => p.name === 'Tienda')
  assert(project, 'the project exists')
  const detail = (await command('project_get', { project_id: project.id })).project
  assert.deepEqual(
    detail.folders.map((f) => [basename(f.path), f.primary, f.trust_state]),
    [['api', true, 'trusted'], ['web', false, 'trusted']],
  )
  // A temporary conversation of the project: its chip, and no session yet (#60).
  await wait(`document.querySelector('[data-testid="composer-project-chip"]')?.innerText.includes('Tienda')`)
  const before = await command('session_list', { project_id: project.id, include_closed: true })
  assert.equal(before.sessions.length, 0, 'creating the project leaves no empty conversation')
  await screenshot('created')
  await input('.composer-surface textarea', 'Hola proyecto')
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await wait(`!document.querySelector('[data-testid="composer-project-chip"]')`)
  const after = await command('session_list', { project_id: project.id, include_closed: true })
  assert.equal(after.sessions.length, 1, 'the first message creates the conversation in the project')
  report({ passed: ['window instead of picker', 'invalid folder explained and blocks create', 'trust on by default, off with a warning for hooks', 'trust all and summary', 'project with two trusted folders', 'a draft of the project instead of an empty conversation', 'the first message creates it in the project'] })
})

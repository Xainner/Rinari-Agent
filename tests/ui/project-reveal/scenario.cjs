// Un proyecto colapsado de la barra lateral se despliega solo cuando el Engine
// confirma una conversación nueva en él (barra lateral, inicio del proyecto,
// Boards o carpeta nueva), sin tocar los demás. La elección sobrevive a un
// reinicio completo.
const { dialog } = require('electron')
const assert = require('node:assert/strict')
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { ui, click, clickText, command, evaluate, input, key, reload, report, scenario, screenshot, useLocalModel, wait, delay } = require('../harness.cjs')

const choices = () => evaluate(`JSON.parse(localStorage.getItem('rinari.projectsExpanded') || '{}')`)
const header = (p) => `section[aria-label="Proyectos"] button[title=${JSON.stringify(p.root)}]`
async function expanded(p, expected) {
  await wait(`JSON.parse(localStorage.getItem('rinari.projectsExpanded') || '{}')[${JSON.stringify(p.id)}]===${JSON.stringify(expected)}`)
  await wait(`document.querySelector(${JSON.stringify(header(p))})?.getAttribute('aria-expanded')===${JSON.stringify(String(expected))}`)
  assert.equal((await choices())[p.id], expected)
}
async function collapse(p) {
  if (await evaluate(`document.querySelector(${JSON.stringify(header(p))})?.getAttribute('aria-expanded')==='true'`)) await click(header(p))
  await expanded(p, false)
}
async function edit(p) {
  await click(`${header(p)} + button + [aria-label="Opciones del proyecto"]`)
  await clickText('Editar', '[role="menuitem"]')
  await wait(`Boolean(document.querySelector('section[aria-label="Detalles del proyecto"] input'))`)
}
const addFromFolder = () => evaluate(`[...document.querySelectorAll('[role="dialog"] .add-pane-row')].find(b=>b.textContent.includes('Abrir carpeta')).click()`)
const search = 'input[placeholder="Buscar proyectos y sesiones…"]'
const details = 'section[aria-label="Detalles del proyecto"] input'

async function exercise() {
  const passed = []
  await useLocalModel()
  const projects = []
  for (const name of ['Proyecto Alfa', 'Proyecto Beta']) {
    const path = join(ui.data, name); mkdirSync(path)
    const { project } = await command('project_add', { path, name })
    projects.push(project)
    await command('session_create', { project_id: project.id, title: name + ' inicial' })
  }
  const [a, b] = projects
  const { session: loose } = await command('session_create', { chat: true, title: 'Conversación libre' })
  await evaluate(`localStorage.setItem('rinari.projectsExpanded',${JSON.stringify(JSON.stringify({ [a.id]: false, [b.id]: false }))})`)
  await reload()
  await expanded(a, false); await expanded(b, false)
  await input(search, 'Proyecto Alfa')
  await click('button[aria-label="Nueva sesión en Proyecto Alfa"]')
  await expanded(a, true); await expanded(b, false)
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(search)}).value`), '')
  await wait(`document.querySelector(${JSON.stringify(header(a))}).closest('li').querySelectorAll('ul li').length===2`)
  passed.push('Sidebar + creates a real session, clears search and persists only its project')
  await screenshot('sidebar-created')
  await collapse(a)
  await edit(a)
  await input(search, 'hidden by old search')
  await clickText('Nueva sesión')
  await expanded(a, true)
  await wait(`document.querySelector(${JSON.stringify(header(a))}).closest('li').querySelectorAll('ul li').length===3`)
  passed.push('ProjectHome creation reveals a manually collapsed project and clears hidden search')
  await collapse(a)
  await edit(a)
  await input(details, 'Alfa renombrado')
  await clickText('Guardar')
  await wait(`document.querySelector(${JSON.stringify(header(a))}).textContent.includes('Alfa renombrado')`)
  await expanded(a, false)
  await click('button[aria-label="Volver"]')
  await clickText('Conversación libre')
  const normal = await evaluate(`document.querySelector('[aria-current="page"]')?.textContent`)
  await click('.view-switcher button[aria-label="Boards"]')
  await input(search, 'old filter')
  await click('.board-empty-primary')
  await wait(`Boolean(document.querySelector('[role="dialog"]'))`)
  await clickText('Alfa renombrado', '[role="dialog"] .add-pane-row', { includes: true })
  await wait('document.querySelectorAll("[data-pane-id]").length===1')
  await expanded(a, true)
  await click('.view-switcher button[aria-label="Normal"]')
  assert.equal(await evaluate(`document.querySelector('[aria-current="page"]')?.textContent`), normal)
  passed.push('Boards creation reveals project without changing Normal selection; rename respects collapse')
  await collapse(a)
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Nueva conversación') && b.textContent.includes('Ctrl')).click()`)
  await delay(400)
  await expanded(a, false); await expanded(b, false)
  passed.push('Generic chat leaves previous projects collapsed')

  // Frontera del selector nativo: devuelve una carpeta aislada real; todo lo
  // que hace el Engine con ella es de verdad.
  const originalDialog = dialog.showOpenDialog
  let picked
  dialog.showOpenDialog = async () => ({ canceled: !picked, filePaths: picked ? [picked] : [] })
  try {
    await click('button[aria-label="Abrir carpeta"]')
    await expanded(a, false)
    passed.push('Cancelled folder picker leaves preferences untouched')
    picked = join(ui.data, 'Proyecto nuevo'); mkdirSync(picked)
    await input(search, 'old filter')
    await click('button[aria-label="Abrir carpeta"]')
    await wait(`(async()=> (await window.rinariDesktop.command('project_list',{})).projects.some(p=>p.name==='Proyecto nuevo'))()`)
    const c = (await command('project_list')).projects.find((p) => p.name === 'Proyecto nuevo')
    projects.push(c)
    await expanded(c, true)
    await clickText('Ahora no')
    await edit(c)
    await input(details, 'Proyecto con nombre inicial')
    await clickText('Guardar')
    await wait(`document.querySelector(${JSON.stringify(header(c))}).textContent.includes('Proyecto con nombre inicial')`)
    await expanded(c, true)
    await click('button[aria-label="Volver"]')
    await clickText('Conversación libre')
    await expanded(c, true)
    passed.push('New folder registration stays expanded through initial naming and session changes')
    await screenshot('new-project-named')
    picked = join(ui.data, 'Proyecto Boards'); mkdirSync(picked)
    await click('.view-switcher button[aria-label="Boards"]')
    await click('button[aria-label="Añadir panel"]')
    await addFromFolder()
    await wait('document.querySelectorAll("[data-pane-id]").length===2')
    const d = (await command('project_list')).projects.find((p) => p.name === 'Proyecto Boards')
    projects.push(d)
    await expanded(d, true)
    await collapse(d)
    await click('button[aria-label="Añadir panel"]')
    await addFromFolder()
    await wait(`Boolean(document.querySelector('[role="alertdialog"]'))`)
    await clickText('Cancelar', '[role="alertdialog"] button')
    await expanded(d, false)
    await key('Escape') // cierra el diálogo de Añadir panel que queda abierto
    await delay(300)
    await click('.view-switcher button[aria-label="Normal"]')
    await expanded(a, false); await expanded(b, false); await expanded(c, true); await expanded(d, false)
    passed.push('Boards registers and reveals new folder; cancelling duplicate creation preserves collapse')
  } finally {
    dialog.showOpenDialog = originalDialog
  }
  await screenshot('final-preferences')
  writeFileSync(join(ui.data, 'expected.json'), JSON.stringify({ projects, choices: await choices(), loose: loose.id }, null, 2))
  report({ passed })
}

async function restart() {
  const saved = JSON.parse(readFileSync(join(ui.data, 'expected.json'), 'utf8'))
  assert.deepEqual(await choices(), saved.choices, 'Preferences survive a complete process restart')
  for (const p of saved.projects) await expanded(p, saved.choices[p.id])
  await screenshot('restart-persistence')
  report({ passed: ['expansion preferences survive restarting the app and the Engine'] })
}

scenario(ui.phase === 'restart' ? restart : exercise, { width: 1450, height: 900 })

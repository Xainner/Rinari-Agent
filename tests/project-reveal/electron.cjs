const { app, BrowserWindow, dialog } = require('electron')
const { join } = require('node:path')
const { mkdirSync, writeFileSync, readFileSync } = require('node:fs')
const assert = require('node:assert/strict')
const data = process.env.PROJECT_REVEAL_DATA
const output = process.env.PROJECT_REVEAL_OUTPUT
app.setPath('userData', join(data, 'profile'))
require('../../dist-electron/main.cjs')
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let win
const evaluate = (code) => win.webContents.executeJavaScript(code)
async function wait(code) {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (await evaluate(code)) return
    await delay(100)
  }
  throw new Error(`Timed out: ${code}`)
}
async function click(selector) {
  await wait(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'})`)
  const point = await evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`)
  win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point })
  win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point })
  await delay(180)
}
async function clickText(text, scope = 'button') {
  await wait(`[...document.querySelectorAll(${JSON.stringify(scope)})].some(b=>b.textContent.trim()===${JSON.stringify(text)})`)
  await evaluate(`[...document.querySelectorAll(${JSON.stringify(scope)})].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`)
  await delay(180)
}
async function input(selector, value) {
  await evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`)
  await delay(100)
}
const command = (name, args = {}) => evaluate(`window.rinariDesktop.command(${JSON.stringify(name)},${JSON.stringify(name === 'session_create' ? { mode: 'build', permission_profile: 'workspace', ...args } : args)})`)
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
async function screenshot(name) {
  writeFileSync(join(output, name + '.png'), (await win.webContents.capturePage()).toPNG())
}
async function ready() {
  await wait('Boolean(window.rinariDesktop)')
  await wait('(async () => (await window.rinariDesktop.engine.status()).state === "ready")()')
  await wait('Boolean(document.querySelector(".view-switcher"))')
  await delay(350)
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Configurar después')?.click()`)
}
async function edit(p) {
  await click(`${header(p)} + button + [aria-label="Opciones del proyecto"]`)
  await clickText('Editar', '[role="menuitem"]')
  await wait('Boolean(document.querySelector(\'section[aria-label="Detalles del proyecto"] input\'))')
}
async function run() {
  await app.whenReady()
  while (!(win = BrowserWindow.getAllWindows()[0])) await delay(50)
  await ready()
  if (win.isMaximized()) win.unmaximize()
  win.setContentSize(1450, 900)
  if (process.env.PROJECT_REVEAL_PHASE === 'restart') {
    const saved = JSON.parse(readFileSync(join(data, 'expected.json'), 'utf8'))
    assert.deepEqual(await choices(), saved.choices, 'Preferences survive a complete process restart')
    for (const p of saved.projects) await expanded(p, saved.choices[p.id])
    await screenshot('restart-persistence')
    console.log('PROJECT_REVEAL_RESTART_OK')
    if (process.env.PROJECT_REVEAL_KEEP === '1') {
      win.setTitle('Rinari Agent — Prueba despliegue de proyectos')
      win.show(); win.focus()
      return
    }
    app.quit(); return
  }
  const report = []
  await command('provider_create', { alias: 'prueba-local', provider_type: 'custom', auth_method: 'none', endpoint: 'http://127.0.0.1:9/v1' })
  await command('model_add', { provider: 'prueba-local', provider_model_id: 'fixture', alias: 'prueba-local' })
  await command('model_use', { reference: 'prueba-local' })
  const projects = []
  for (const name of ['Proyecto Alfa', 'Proyecto Beta']) {
    const path = join(data, name); mkdirSync(path)
    const { project } = await command('project_add', { path, name })
    projects.push(project)
    await command('session_create', { project_id: project.id, title: name + ' inicial' })
  }
  const [a, b] = projects
  const { session: loose } = await command('session_create', { chat: true, title: 'Conversación libre' })
  await evaluate(`localStorage.setItem('rinari.projectsExpanded',${JSON.stringify(JSON.stringify({ [a.id]: false, [b.id]: false }))})`)
  win.webContents.reload(); await ready()
  await expanded(a, false); await expanded(b, false)
  const search = 'input[placeholder="Buscar proyectos y sesiones…"]'
  await input(search, 'Proyecto Alfa')
  await click('button[aria-label="Nueva sesión en Proyecto Alfa"]')
  await expanded(a, true); await expanded(b, false)
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(search)}).value`), '')
  await wait(`document.querySelector(${JSON.stringify(header(a))}).closest('li').querySelectorAll('ul li').length===2`)
  report.push('Sidebar + creates a real session, clears search and persists only its project')
  await screenshot('sidebar-created')
  await collapse(a)
  await edit(a)
  await input(search, 'hidden by old search')
  await clickText('Nueva sesión')
  await expanded(a, true)
  await wait(`document.querySelector(${JSON.stringify(header(a))}).closest('li').querySelectorAll('ul li').length===3`)
  report.push('ProjectHome creation reveals a manually collapsed project and clears hidden search')
  await collapse(a)
  await edit(a)
  await input('section[aria-label="Detalles del proyecto"] input', 'Alfa renombrado')
  await clickText('Guardar')
  await wait(`document.querySelector(${JSON.stringify(header(a))}).textContent.includes('Alfa renombrado')`)
  await expanded(a, false)
  await click('button[aria-label="Volver"]')
  await clickText('Conversación libre')
  const normal = await evaluate(`document.querySelector('[aria-current="page"]')?.textContent`)
  await click('.view-switcher button[aria-label="Boards"]')
  await input(search, 'old filter')
  await click('.board-empty-primary')
  await wait('Boolean(document.querySelector(\'[role="dialog"]\'))')
  await evaluate(`[...document.querySelectorAll('[role="dialog"] .add-pane-row')].find(b=>b.textContent.includes('Alfa renombrado')).click()`)
  await wait('document.querySelectorAll("[data-pane-id]").length===1')
  await expanded(a, true)
  await click('.view-switcher button[aria-label="Normal"]')
  assert.equal(await evaluate(`document.querySelector('[aria-current="page"]')?.textContent`), normal)
  report.push('Boards creation reveals project without changing Normal selection; rename respects collapse')
  await collapse(a)
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Nueva conversación') && b.textContent.includes('Ctrl')).click()`)
  await delay(400)
  await expanded(a, false); await expanded(b, false)
  report.push('Generic chat leaves previous projects collapsed')
  // Native picker boundary: return a real isolated folder; all Engine work stays real.
  const originalDialog = dialog.showOpenDialog
  let picked
  dialog.showOpenDialog = async () => ({ canceled: !picked, filePaths: picked ? [picked] : [] })
  await click('button[aria-label="Abrir carpeta"]')
  await expanded(a, false)
  report.push('Cancelled folder picker leaves preferences untouched')
  picked = join(data, 'Proyecto nuevo'); mkdirSync(picked)
  await input(search, 'old filter')
  await click('button[aria-label="Abrir carpeta"]')
  await wait(`(async()=> (await window.rinariDesktop.command('project_list',{})).projects.some(p=>p.name==='Proyecto nuevo'))()`)
  const c = (await command('project_list')).projects.find(p => p.name === 'Proyecto nuevo')
  projects.push(c)
  await expanded(c, true)
  await wait(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Ahora no')`)
  await clickText('Ahora no')
  await edit(c)
  await input('section[aria-label="Detalles del proyecto"] input', 'Proyecto con nombre inicial')
  await clickText('Guardar')
  await wait(`document.querySelector(${JSON.stringify(header(c))}).textContent.includes('Proyecto con nombre inicial')`)
  await expanded(c, true)
  await click('button[aria-label="Volver"]')
  await clickText('Conversación libre')
  await expanded(c, true)
  report.push('New folder registration stays expanded through initial naming and session changes')
  await screenshot('new-project-named')
  picked = join(data, 'Proyecto Boards'); mkdirSync(picked)
  await click('.view-switcher button[aria-label="Boards"]')
  await click('button[aria-label="Añadir panel"]')
  await evaluate(`[...document.querySelectorAll('[role="dialog"] .add-pane-row')].find(b=>b.textContent.includes('Abrir carpeta')).click()`)
  await wait('document.querySelectorAll("[data-pane-id]").length===2')
  const d = (await command('project_list')).projects.find(p => p.name === 'Proyecto Boards')
  projects.push(d)
  await expanded(d, true)
  await collapse(d)
  await click('button[aria-label="Añadir panel"]')
  await evaluate(`[...document.querySelectorAll('[role="dialog"] .add-pane-row')].find(b=>b.textContent.includes('Abrir carpeta')).click()`)
  await wait('Boolean(document.querySelector(\'[role="alertdialog"]\'))')
  await clickText('Cancelar', '[role="alertdialog"] button')
  await expanded(d, false)
  // Close the remaining add pane dialog.
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
  await delay(300)
  dialog.showOpenDialog = originalDialog
  await click('.view-switcher button[aria-label="Normal"]')
  await expanded(a, false); await expanded(b, false); await expanded(c, true); await expanded(d, false)
  report.push('Boards registers and reveals new folder; cancelling duplicate creation preserves collapse')
  await screenshot('final-preferences')
  writeFileSync(join(data, 'expected.json'), JSON.stringify({ projects, choices: await choices(), loose: loose.id }, null, 2))
  writeFileSync(join(output, 'report.json'), JSON.stringify({ report, data }, null, 2))
  console.log('PROJECT_REVEAL_E2E_OK ' + JSON.stringify(report))
  app.quit()
}
run().catch(async (error) => {
  console.error(error)
  if (win && !win.isDestroyed()) {
    console.error((await evaluate('document.body.innerText')).slice(-6000))
    await screenshot('failure')
  }
  app.exit(1)
})

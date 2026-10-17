// Permisos por defecto de un proyecto (permisos v4 P-5): se eligen en su
// página, «Acceso completo» pide confirmación, la conversación nueva nace con
// ellos (también un borrador abierto antes) y las que ya existían conservan
// los suyos.
const assert = require('node:assert/strict')
const { mkdirSync } = require('node:fs')
const { join } = require('node:path')
const { ui, click, clickText, command, evaluate, input, reload, report, scenario, screenshot, settleAnimations, useLocalModel, wait } = require('../harness.cjs')

const SELECT = '[data-testid="project-permission"]'
const DIALOG = '[data-testid="full-access-dialog"]'
const CHIP = '.composer-surface button[title="Permisos de este chat"]'

const project = async (id) => (await command('project_list', { include_archived: true })).projects.find((p) => p.id === id)
const permissionOf = async (id) => (await command('session_permission_get', { reference: id })).session.permission_profile
const choose = (value) => evaluate(`(() => {const el=document.querySelector(${JSON.stringify(SELECT)});Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('change',{bubbles:true}))})()`)

scenario(async () => {
  const passed = []
  await useLocalModel()
  const path = join(ui.data, 'Alfa'); mkdirSync(path)
  const { project: alfa } = await command('project_add', { path, name: 'Alfa' })
  const { session: before } = await command('session_create', { project_id: alfa.id, title: 'Anterior' })
  await reload()

  const header = `section[aria-label="Proyectos"] button[title=${JSON.stringify(alfa.root)}]`
  await click(`${header} + button + [aria-label="Opciones del proyecto"]`)
  await clickText('Editar', '[role="menuitem"]')
  await wait(`document.querySelector(${JSON.stringify(SELECT)})?.value === 'workspace'`)
  await choose('read-only')
  await wait(`(async()=> (await window.rinariDesktop.command('project_list',{include_archived:true})).projects.find(p=>p.id===${JSON.stringify(alfa.id)}).permission_profile==='read-only')()`)
  passed.push('the project page sets the mode new conversations start in')

  await clickText('Nueva sesión')
  await wait(`document.querySelector(${JSON.stringify(CHIP)})?.innerText.includes('Solo lectura')`)
  await screenshot('draft-read-only')
  await input('.composer-surface textarea', 'Hola desde Alfa')
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await wait(`(async()=> (await window.rinariDesktop.command('session_list',{project_id:${JSON.stringify(alfa.id)}})).sessions.length===2)()`)
  const created = (await command('session_list', { project_id: alfa.id })).sessions.find((s) => s.id !== before.id)
  assert.equal(await permissionOf(created.id), 'read-only', 'the new conversation is born read-only')
  assert.equal(await permissionOf(before.id), 'workspace', 'an existing conversation keeps its own')
  passed.push('a new conversation of the project is born with its default; older ones keep theirs')

  await click('button[aria-label="Volver"]').catch(() => {})
  await click(`${header} + button + [aria-label="Opciones del proyecto"]`)
  await clickText('Editar', '[role="menuitem"]')
  await wait(`Boolean(document.querySelector(${JSON.stringify(SELECT)}))`)
  await choose('full-access')
  await wait(`Boolean(document.querySelector(${JSON.stringify(DIALOG)}))`)
  await settleAnimations()
  await screenshot('full-access-confirm')
  await clickText('Cancelar', `${DIALOG} button`)
  await wait(`!document.querySelector(${JSON.stringify(DIALOG)})`)
  assert.equal((await project(alfa.id)).permission_profile, 'read-only', 'cancel changes nothing')
  await choose('full-access')
  await wait(`Boolean(document.querySelector(${JSON.stringify(DIALOG)}))`)
  await clickText('Activar acceso completo', `${DIALOG} button`)
  await wait(`(async()=> (await window.rinariDesktop.command('project_list',{include_archived:true})).projects.find(p=>p.id===${JSON.stringify(alfa.id)}).permission_profile==='full-access')()`)
  const { session: viaEngine } = await command('session_create', { project_id: alfa.id, title: 'Sin pedir modo', permission_profile: null })
  assert.equal(await permissionOf(viaEngine.id), 'full-access', 'without asking for a mode the Engine uses the project default')
  passed.push('full access as default asks first; the Engine applies the default when nothing is asked')

  await choose('workspace')
  await wait(`(async()=> (await window.rinariDesktop.command('project_list',{include_archived:true})).projects.find(p=>p.id===${JSON.stringify(alfa.id)}).permission_profile===null)()`)
  assert.equal(await evaluate(`Boolean(document.querySelector(${JSON.stringify(DIALOG)}))`), false, 'lowering never asks')
  passed.push('back to Proyecto clears the default without asking')
  report({ passed })
})

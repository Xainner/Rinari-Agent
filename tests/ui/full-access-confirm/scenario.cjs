// «Acceso completo» pide confirmación: el diálogo explica qué permite, qué
// sigue preguntando y cómo quitarlo; cancelar no cambia nada; solo al
// confirmar la conversación pasa a full-access. Bajar el permiso no pregunta.
const assert = require('node:assert/strict')
const { click, clickText, command, evaluate, reload, report, scenario, screenshot, settleAnimations, useLocalModel, wait } = require('../harness.cjs')

const CHIP = '.composer-surface button[title="Permisos de este chat"]'
const DIALOG = '[data-testid="full-access-dialog"]'

async function profile(sessionId) {
  return (await command('session_permission_get', { reference: sessionId })).session.permission_profile
}

async function choose(label) {
  await click(CHIP)
  await wait(`[...document.querySelectorAll('[role="dialog"] button, .r-pop button')].some(b => b.textContent.includes(${JSON.stringify(label)}))`)
  await evaluate(`[...document.querySelectorAll('.r-pop button')].find(b => b.textContent.includes(${JSON.stringify(label)})).click()`)
}

scenario(async () => {
  await useLocalModel()
  const session = (await command('session_create', { chat: true, title: 'Permisos' })).session.id
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Permisos', 'aside button', { includes: true })
  await wait(`Boolean(document.querySelector(${JSON.stringify(CHIP)}))`)
  assert.equal(await profile(session), 'workspace')

  await choose('Acceso completo')
  await wait(`Boolean(document.querySelector(${JSON.stringify(DIALOG)}))`)
  await settleAnimations()
  const body = await evaluate(`document.querySelector(${JSON.stringify(DIALOG)}).innerText`)
  for (const part of ['Archivos y carpetas', 'Comandos de terminal', 'Internet y aplicaciones conectadas', 'forzar un push', 'chip de permisos']) {
    assert(body.includes(part), `dialog explains: ${part}`)
  }
  await screenshot('dialog')
  await clickText('Cancelar', `${DIALOG} button`)
  await wait(`!document.querySelector(${JSON.stringify(DIALOG)})`)
  assert.equal(await profile(session), 'workspace', 'cancel changes nothing')

  await choose('Acceso completo')
  await wait(`Boolean(document.querySelector(${JSON.stringify(DIALOG)}))`)
  await clickText('Activar acceso completo', `${DIALOG} button`)
  await wait(`!document.querySelector(${JSON.stringify(DIALOG)})`)
  await wait(`document.querySelector(${JSON.stringify(CHIP)}).innerText.includes('Acceso completo')`)
  assert.equal(await profile(session), 'full-access')
  await screenshot('chip-full-access')

  await choose('Workspace')
  await wait(`document.querySelector(${JSON.stringify(CHIP)}).innerText.includes('Workspace')`)
  assert.equal(await evaluate(`Boolean(document.querySelector(${JSON.stringify(DIALOG)}))`), false, 'lowering never asks')
  assert.equal(await profile(session), 'workspace')
  report({ passed: ['dialog before full access', 'explains groups, what still asks and how to undo', 'cancel keeps workspace', 'confirm applies full-access', 'lowering does not ask'] })
})

// Conversación nueva con el chip de proyecto del composer (#42), con el Engine real:
// 1. «Nueva conversación» empieza en «Sin proyecto».
// 2. Ctrl+Shift+O abre el selector; lo escrito y el modo viajan al elegir un proyecto.
// 3. El primer mensaje crea la conversación en ese proyecto y el chip desaparece.
const assert = require('node:assert/strict')
const { mkdirSync } = require('node:fs')
const { join } = require('node:path')
const { click, clickText, command, evaluate, input, key, reload, report, scenario, screenshot, settleAnimations, useLocalModel, ui, wait } = require('../harness.cjs')

const CHIP = '[data-testid="composer-project-chip"]'
const MENU = '[data-testid="composer-project-menu"]'
const BOX = '.composer-surface textarea'
const PLAN_PRESSED = `[...document.querySelectorAll('.composer-surface button[aria-pressed]')].find((b) => b.textContent.trim() === 'PLAN')?.getAttribute('aria-pressed') === 'true'`

scenario(async () => {
  await useLocalModel()
  const shop = join(ui.data, 'workspace', 'tienda')
  mkdirSync(shop, { recursive: true })
  await command('project_add', { path: shop, name: 'Tienda' })
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')

  // 1. A new conversation starts without a project.
  await clickText('Nueva conversación', 'button', { includes: true })
  await wait(`document.querySelector(${JSON.stringify(CHIP)})?.innerText.includes('Sin proyecto')`)

  // 2. Write, switch to PLAN, open the picker with the shortcut and choose the project.
  await input(BOX, 'Revisa el README')
  await clickText('PLAN', '.composer-surface button')
  await wait(PLAN_PRESSED)
  await evaluate(`document.querySelector(${JSON.stringify(BOX)}).focus()`)
  await key('O', ['control', 'shift'])
  await wait(`Boolean(document.querySelector(${JSON.stringify(MENU)}))`)
  await settleAnimations()
  await screenshot('menu')
  await clickText('Tienda', `${MENU} button`, { includes: true })
  await wait(`document.querySelector(${JSON.stringify(CHIP)})?.innerText.includes('Tienda')`)
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(BOX)}).value`), 'Revisa el README', 'what was written travels')
  assert(await evaluate(PLAN_PRESSED), 'the mode travels')

  // 3. The first message creates the conversation in the project.
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await wait(`!document.querySelector(${JSON.stringify(CHIP)})`)
  const project = (await command('project_list', {})).projects.find((item) => item.name === 'Tienda')
  const sessions = (await command('session_list', { project_id: project.id, include_closed: true })).sessions
  assert.equal(sessions.length, 1, 'created under the chosen project')
  assert.equal(sessions[0].mode, 'plan', 'created in the chosen mode')
  await screenshot('sent')
  report({ passed: ['starts without a project', 'shortcut opens the picker', 'text and mode travel to the chosen project', 'first message creates it in the project', 'chip gone after sending'] })
})

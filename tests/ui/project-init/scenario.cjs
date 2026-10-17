// `/init` con el Engine real y un modelo guionado (#81):
// 1. En una conversación nueva de un proyecto, la sugerencia «Conoce el
//    proyecto» escribe /init; al enviarlo, la conversación nace y Rinari
//    explora en solo lectura (la conversación sigue en BUILD).
// 2. La propuesta llega como tarjeta; nada se escribe hasta «Guardar».
// 3. «Guardar» escribe el RINARI.md del proyecto y la tarjeta lo dice.
const assert = require('node:assert/strict')
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { click, clickText, command, evaluate, input, key, reload, report, scenario, screenshot, settleAnimations, useLocalModel, ui, wait } = require('../harness.cjs')

const CARD = '[data-testid="instructions-proposal"]'

scenario(async () => {
  await useLocalModel()
  const shop = join(ui.data, 'workspace', 'tienda')
  mkdirSync(shop, { recursive: true })
  writeFileSync(join(shop, 'package.json'), JSON.stringify({ name: 'tienda', scripts: { test: 'vitest run' } }))
  await command('project_add', { path: shop, name: 'Tienda' })
  await command('project_trust', { path: shop }).catch(() => {})
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')

  // 1. A new conversation of the project: the suggestion writes /init.
  await clickText('Nueva conversación', 'button', { includes: true })
  await click('[data-testid="composer-project-chip"]')
  await clickText('Tienda', '[data-testid="composer-project-menu"] button', { includes: true })
  await wait(`document.querySelector('[data-testid="composer-project-chip"]')?.innerText.includes('Tienda')`)
  await clickText('Conoce el proyecto', '.home-card', { includes: true })
  await wait(`document.querySelector('.composer-surface textarea').value === '/init'`)
  await evaluate(`document.querySelector('.composer-surface textarea').focus()`)
  await key('Return')

  // 2. The proposal card; nothing written yet.
  await wait(`Boolean(document.querySelector(${JSON.stringify(CARD)}))`, 60_000)
  assert.equal(existsSync(join(shop, 'RINARI.md')), false, 'nothing is written before «Guardar»')
  const project = (await command('project_list', {})).projects.find((item) => item.name === 'Tienda')
  const session = (await command('session_list', { project_id: project.id, include_closed: true })).sessions[0]
  assert(session, 'the conversation was created for /init')
  assert.equal(session.mode, 'build', 'the conversation keeps its mode: only the turn was read-only')
  await settleAnimations()
  await screenshot('proposal')

  // 3. «Guardar» writes it.
  await click('[data-testid="instructions-proposal-save"]')
  await wait(`Boolean(document.querySelector('[data-testid="instructions-proposal-outcome"]'))`)
  assert.match(readFileSync(join(shop, 'RINARI.md'), 'utf8'), /## Cómo probar/)
  await screenshot('saved')
  report({ passed: ['suggestion writes /init', 'conversation created for /init', 'proposal card, nothing written', 'mode unchanged', 'save writes RINARI.md'] })
})

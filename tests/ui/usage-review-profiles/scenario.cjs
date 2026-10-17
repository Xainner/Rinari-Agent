// Tandas 22–23 de 0.4.0 con el Engine real, para ver su diseño:
// 1. `/usage` deja en el chat el informe de uso: cifras arriba, la tabla por
//    modelo y los avisos; cambiar de ámbito lo rehace.
// 2. «Exportar desde aquí» es un icono junto al mensaje (aparece al pasar) y abre «Exportar para
//    revisión» desde ese mensaje.
// 3. Ajustes → Perfiles: tarjetas de la misma altura; el modelo propio de un
//    agente resaltado y el perfil en uso encendido.
// 4. Ajustes → Personalidad: «Así suena» cambia de texto con el nivel.
const assert = require('node:assert/strict')
const { click, clickText, command, delay, evaluate, input, key, menuShortcut, reload, report, scenario, screenshot, settleAnimations, ui, useLocalModel, wait } = require('../harness.cjs')

scenario(async () => {
  await useLocalModel()
  await command('session_create', { chat: true, title: 'Uso' })
  await command('bundle_create', { id: 'diseno', name: 'Diseño', description: 'Interfaces y arte, con su propio explorador.' })
  await command('bundle_update', { id: 'diseno', agents: { explore: { model: 'prueba-local' } } })
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Uso', 'aside button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  await input('.composer-surface textarea', 'Hola')
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await wait(`document.body.innerText.includes('HOLA')`)

  // 1. /usage paints the report in the chat.
  await input('.composer-surface textarea', '/usage')
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await wait(`Boolean(document.querySelector('[data-testid="usage-report"]'))`, 30_000)
  assert.ok(await evaluate(`Boolean(document.querySelector('[data-testid="usage-report"] .usage-report-totals dd'))`), 'the totals are on top')
  await evaluate(`document.querySelector('[data-testid="usage-report"]').scrollIntoView({ block: 'center' })`)
  await settleAnimations()
  await screenshot('01-usage-report')
  await clickText('Hoy', '[data-testid="usage-report"] [role="tab"]')
  await wait(`document.querySelector('[data-testid="usage-report"]').dataset.scope === 'today'`, 30_000)

  // 2. «Exportar desde aquí» on the user message (saved messages only: reopen the conversation).
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Uso', 'aside button', { includes: true })
  await wait(`Boolean(document.querySelector('[data-testid="export-from-message"]'))`, 30_000)
  assert.equal(await evaluate(`document.querySelector('[data-testid="export-from-message"]').getBoundingClientRect().width`), 24, 'an icon, not a second pill with text')
  await evaluate(`document.querySelector('[data-testid="export-from-message"]').click()`)
  await wait(`Boolean(document.querySelector('[data-testid="review-export"]'))`)
  await settleAnimations()
  await screenshot('03-review-export')
  await key('Escape')
  await wait(`!document.querySelector('[data-testid="review-export"]')`)

  // 3. Profiles.
  await menuShortcut('settings', 'CmdOrCtrl+,')
  await clickText('Perfiles', 'nav button')
  await wait(`document.querySelectorAll('[data-testid="profile-card"]').length >= 2`)
  const heights = await evaluate(`[...document.querySelectorAll('[data-testid="profile-card"]')].map((card) => Math.round(card.getBoundingClientRect().height))`)
  assert.equal(new Set(heights.slice(0, 2)).size, 1, `cards in a row share their height (${heights})`)
  assert.ok(await evaluate(`Boolean(document.querySelector('[data-testid="profile-card"] dd[data-own]'))`), 'the own model is marked')
  await settleAnimations()
  await screenshot('04-profiles')
  // The form: per agent its model, fallback and effort (#86).
  await evaluate(`[...document.querySelectorAll('[data-testid="profile-card"]')].find((card) => card.textContent.includes('Diseño')).querySelector('.profile-card-actions .btn-secondary').click()`)
  await wait(`Boolean(document.querySelector('[data-testid="profile-form"] [data-testid="profile-agent-effort-explore"]'))`)
  assert.match(await evaluate(`document.querySelector('[data-testid="profile-agent-model-explore"]').textContent`), /prueba-local/)
  await settleAnimations()
  await screenshot('04b-profile-form')
  await key('Escape')
  await wait(`!document.querySelector('[data-testid="profile-form"]')`)

  // 4. Personality: «Así suena» follows the level.
  await clickText('Personalidad', 'nav button')
  await wait(`Boolean(document.querySelector('[data-testid="soul-preview"]'))`, 30_000)
  const before = await evaluate(`document.querySelector('[data-testid="soul-preview"] [data-kind="greeting"] .soul-preview-text').textContent`)
  await evaluate(`[...document.querySelectorAll('[role="radio"]')].find((radio) => radio.getAttribute('aria-checked') !== 'true' && radio.closest('.settings-card')?.querySelector('[data-testid="soul-preview"]')).click()`)
  await wait(`document.querySelector('[data-testid="soul-preview"] [data-kind="greeting"] .soul-preview-text').textContent !== ${JSON.stringify(before)}`)
  await evaluate(`document.querySelector('[data-testid="soul-preview"]').scrollIntoView({ block: 'center' })`)
  await settleAnimations()
  await screenshot('05-soul-preview')
  report({ passed: ['usage report in the chat', 'export from a message opens the review dialog', 'profile cards', 'soul preview follows the level'] })
}, { width: 1400, height: 900 })

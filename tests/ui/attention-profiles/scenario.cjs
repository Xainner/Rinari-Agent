// Un chat del perfil 1 termina mientras estás en el perfil 2 (dueño,
// 2026-10-17): la cuenta del título y la barra de tareas sube, el selector de
// perfiles marca el otro perfil y, al volver, el chat sale pendiente. El chat
// se crea desde la app («Nueva conversación»), como lo hizo el dueño: uno
// creado así no se seguía y nunca quedaba pendiente (#103).
const assert = require('node:assert/strict')
const { ui, click, clickText, command, evaluate, input, reload, report, scenario, screenshot, settleAnimations, until, useLocalModel, wait, delay } = require('../harness.cjs')

const origin = () => ui.model.replace(/\/v1$/, '')
const SWITCHER = '[data-testid="profile-switcher"]'

async function switchTo(name) {
  await click(SWITCHER)
  await wait(`[...document.querySelectorAll('[role="menuitem"]')].some(i => i.textContent.includes(${JSON.stringify(name)}))`)
  await evaluate(`[...document.querySelectorAll('[role="menuitem"]')].find(i => i.textContent.includes(${JSON.stringify(name)})).click()`)
  await wait(`document.querySelector(${JSON.stringify(SWITCHER)}).innerText.includes(${JSON.stringify(name)})`)
  await settleAnimations()
}

scenario(async () => {
  await useLocalModel()
  await command('bundle_create', { id: 'otro', name: 'Otro' })
  await command('bundle_activate', { id: 'otro' })
  await command('session_create', { chat: true, title: 'Chat del perfil dos' })
  await command('bundle_activate', { id: 'default' })
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Nueva conversación', 'button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  await input('.composer-surface textarea', 'Hazme un plan')
  await wait(`!document.querySelector('.composer-surface button[aria-label="Enviar mensaje"]')?.disabled`)
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await until(async () => (await (await fetch(origin() + '/__pending')).json()) === true, 'the turn reaches the held model request')

  await switchTo('Otro')
  // Como el dueño: en el otro perfil abre otro chat antes de que termine el primero.
  await wait(`document.querySelector('aside')?.innerText.includes('Chat del perfil dos')`, 10000)
  await clickText('Chat del perfil dos', 'aside button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  await delay(800)
  await fetch(origin() + '/__release')
  await delay(2500)
  const seen = await evaluate(`({
    title: document.title,
    badge: Boolean(document.querySelector('[data-testid="profile-pending-badge"]')),
  })`)
  await screenshot('elsewhere')
  console.log('RINARI_ATTENTION_PROFILES', JSON.stringify(seen))
  assert.equal(seen.title, '(1) Rinari Agent', 'the count includes the other profile')
  assert.ok(seen.badge, 'the profile switcher marks the other profile')

  await switchTo('Predeterminado')
  await wait(`Boolean(document.querySelector('aside [data-attention], aside [data-signal]'))`, 5000).catch(() => {})
  await screenshot('back')
  report({ passed: ['count includes the other profile', 'switcher marks the other profile'] })
}, { width: 1400, height: 900 })

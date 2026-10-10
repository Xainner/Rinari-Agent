// Perfiles como espacios de trabajo, con el Engine real:
// 1. Lo que ya existía está en «Predeterminado».
// 2. Cambiar a un perfil nuevo vacía la barra lateral con una transición y
//    Rinari saluda con las dos formas de empezar; la conversación abierta
//    (de otro perfil) deja paso a una nueva.
// 3. Lo creado ahí queda en ese perfil; volver muestra lo de antes.
// 4. «Mover a perfil»: una conversación suelta se mueve sola; una de un
//    proyecto pregunta y «Mover el proyecto entero» lleva todo.
// 5. Reiniciar conserva el perfil activo.
const assert = require('node:assert/strict')
const { click, clickText, command, evaluate, reload, report, scenario, screenshot, settleAnimations, useLocalModel, wait } = require('../harness.cjs')

const SWITCHER = '[data-testid="profile-switcher"]'
const inSidebar = (text) => `document.querySelector('aside')?.innerText.includes(${JSON.stringify(text)})`

async function switchTo(name) {
  await click(SWITCHER)
  await wait(`[...document.querySelectorAll('[role="menuitem"]')].some(i => i.textContent.includes(${JSON.stringify(name)}))`)
  await evaluate(`[...document.querySelectorAll('[role="menuitem"]')].find(i => i.textContent.includes(${JSON.stringify(name)})).click()`)
  await wait(`document.querySelector(${JSON.stringify(SWITCHER)}).innerText.includes(${JSON.stringify(name)})`)
  await settleAnimations()
}

async function rowMenu(title) {
  await evaluate(`(() => {
    const row = [...document.querySelectorAll('aside li')].find(li => li.innerText.includes(${JSON.stringify(title)}))
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }))
  })()`)
}

scenario(async () => {
  await useLocalModel()
  const folder = (await command('session_create', { chat: true, title: 'Charla de casa' })).session
  void folder
  await command('bundle_create', { id: 'trabajo', name: 'Trabajo' })
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')

  // 1. Existing work is in the default profile.
  await wait(`document.querySelector(${JSON.stringify(SWITCHER)})?.innerText.includes('Predeterminado')`)
  await wait(inSidebar('Charla de casa'))
  await clickText('Charla de casa', 'aside button', { includes: true })
  await screenshot('default-profile')

  // 2. A new profile starts empty, with a way to begin.
  await switchTo('Trabajo')
  await wait(`Boolean(document.querySelector('[data-testid="profile-empty"]'))`)
  assert.equal(await evaluate(inSidebar('Charla de casa')), false, 'other profile work is not listed')
  await screenshot('empty-profile')
  assert.equal((await command('bundle_active', {})).active_id, 'trabajo')

  // 3. What is created here stays here.
  const work = (await command('session_create', { chat: true, title: 'Plan del trimestre' })).session
  assert.equal(work.rinari_profile_id, 'trabajo')
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  await wait(inSidebar('Plan del trimestre'))
  assert.equal(await evaluate(inSidebar('Charla de casa')), false)
  await switchTo('Predeterminado')
  await wait(inSidebar('Charla de casa'))
  assert.equal(await evaluate(inSidebar('Plan del trimestre')), false)

  // 4. Moving: a loose conversation goes on its own.
  await rowMenu('Charla de casa')
  await wait(`[...document.querySelectorAll('[role="menuitem"]')].some(i => i.textContent.includes('Mover a perfil'))`)
  await evaluate(`[...document.querySelectorAll('[role="menuitem"]')].find(i => i.textContent.includes('Mover a perfil')).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`)
  await wait(`[...document.querySelectorAll('[role="menuitem"]')].some(i => i.textContent.trim() === 'Trabajo')`)
  await evaluate(`[...document.querySelectorAll('[role="menuitem"]')].find(i => i.textContent.trim() === 'Trabajo').click()`)
  await wait(`!(${inSidebar('Charla de casa')})`)
  await wait(`document.body.innerText.includes('Conversación movida a «Trabajo»')`)
  await screenshot('moved')

  // 5. The active profile survives a restart.
  await switchTo('Trabajo')
  await reload()
  await wait(`document.querySelector(${JSON.stringify(SWITCHER)})?.innerText.includes('Trabajo')`)
  await wait(inSidebar('Charla de casa'))
  report({ passed: ['existing work in default', 'switch empties and greets', 'new work stays in its profile', 'switch back shows old work', 'move a loose conversation', 'active profile survives reload'] })
})

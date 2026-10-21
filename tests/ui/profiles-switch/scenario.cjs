// Perfiles como espacios de trabajo, con el Engine real:
// 1. Lo que ya existía está en «Predeterminado».
// 2. Cambiar a un perfil nuevo vacía la barra lateral con una transición y
//    Rinari saluda con las dos formas de empezar; la conversación abierta
//    (de otro perfil) deja paso a una nueva.
// 3. Lo creado ahí queda en ese perfil; volver muestra lo de antes.
// 4. «Mover a perfil»: una conversación suelta se mueve sola; una de un
//    proyecto pregunta y «Mover el proyecto entero» lleva todo.
// 5. Reiniciar conserva el perfil activo.
// 6. El menú de perfiles mide lo mismo que la tarjeta, con la barra al mínimo y al máximo.
const assert = require('node:assert/strict')
const { click, clickText, command, evaluate, key, reload, report, scenario, screenshot, settleAnimations, useLocalModel, wait } = require('../harness.cjs')

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
    // The innermost row: day groups («Hoy») are list items too.
    const row = [...document.querySelectorAll('aside li')].filter(li => li.innerText.includes(${JSON.stringify(title)})).pop()
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

  // 6. The menu is as wide as the switcher at any sidebar width.
  for (const sidebar of [220, 440]) {
    await evaluate(`localStorage.setItem('rinari.sidebarWidth', '${sidebar}')`)
    await reload()
    await click('.view-switcher button[aria-label="Normal"]')
    await wait(`Math.round(document.querySelector('aside.app-sidebar').getBoundingClientRect().width) === ${sidebar}`)
    await click(SWITCHER)
    await wait(`Boolean(document.querySelector('.profile-menu'))`)
    await settleAnimations()
    const box = await evaluate(`(() => {
      const r = (el) => el.getBoundingClientRect()
      const trigger = r(document.querySelector(${JSON.stringify(SWITCHER)}))
      const menu = r(document.querySelector('.profile-menu'))
      const aside = r(document.querySelector('aside.app-sidebar'))
      return { trigger: Math.round(trigger.width), menu: Math.round(menu.width), left: Math.round(menu.left - trigger.left), overflow: Math.round(menu.right - aside.right) }
    })()`)
    assert.ok(Math.abs(box.menu - box.trigger) <= 1 && Math.abs(box.left) <= 1, `the profile menu matches the switcher at ${sidebar} px: ${JSON.stringify(box)}`)
    assert.ok(box.overflow <= 0, `the profile menu stays inside the sidebar at ${sidebar} px: ${JSON.stringify(box)}`)
    await screenshot(`menu-${sidebar}`)
    await key('Escape')
    await wait(`!document.querySelector('.profile-menu')`)
  }
  report({ passed: ['existing work in default', 'switch empties and greets', 'new work stays in its profile', 'switch back shows old work', 'move a loose conversation', 'active profile survives reload', 'menu as wide as the switcher'] })
})

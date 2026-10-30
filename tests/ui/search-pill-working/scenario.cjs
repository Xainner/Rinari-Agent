// Retoques de 0.4.0 con el Engine real:
// 1. El buscador de la barra lateral tiene una «X» con texto: limpia y deja
//    el foco en el campo.
// 2. El menú de perfiles dice qué perfil trabaja, también el que no está
//    activo (un turno en curso en «Predeterminado» visto desde «Otro»).
// 3. La píldora de un segmentado («Al quedarte sin límites») se desliza de una
//    opción a otra; con movimiento reducido salta sin pasos intermedios.
const assert = require('node:assert/strict')
const { click, clickText, command, delay, evaluate, input, key, menuShortcut, reload, report, scenario, screenshot, settleAnimations, useLocalModel, wait } = require('../harness.cjs')

const SWITCHER = '[data-testid="profile-switcher"]'
const menuItem = (name) => `[...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent.includes(${JSON.stringify(name)}))`

scenario(async () => {
  await useLocalModel()
  await command('session_create', { chat: true, title: 'Trabajo largo' })
  await command('bundle_create', { id: 'otro', name: 'Otro' })
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')

  // 1. The sidebar search clears with its «X».
  await input('.sidebar-search input', 'can')
  await wait(`Boolean(document.querySelector('.sidebar-search [data-testid="search-clear"]'))`)
  await screenshot('search-with-text')
  await click('.sidebar-search [data-testid="search-clear"]')
  await wait(`document.querySelector('.sidebar-search input').value === ''`)
  assert.ok(await evaluate(`document.activeElement === document.querySelector('.sidebar-search input')`), 'the focus stays in the search')
  assert.equal(await evaluate(`Boolean(document.querySelector('.sidebar-search [data-testid="search-clear"]'))`), false, 'no «X» on an empty search')

  // 2. A turn running in «Predeterminado», seen from «Otro».
  await clickText('Trabajo largo', 'aside button', { includes: true })
  await input('.composer-surface textarea', 'Haz un trabajo largo')
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await wait(`Boolean(document.querySelector('.composer-surface button[aria-label="Detener generación"]'))`, 30_000)
  await click(SWITCHER)
  await wait(`Boolean(${menuItem('Otro')})`)
  await evaluate(`${menuItem('Otro')}.click()`)
  await wait(`document.querySelector(${JSON.stringify(SWITCHER)}).innerText.includes('Otro')`)
  await settleAnimations()
  await click(SWITCHER)
  await wait(`Boolean(${menuItem('Predeterminado')}?.querySelector('[data-testid="profile-working"]'))`, 30_000)
  assert.equal(await evaluate(`${menuItem('Predeterminado')}.querySelector('[data-testid="profile-working"]').getAttribute('aria-label')`), 'Una conversación trabajando')
  assert.equal(await evaluate(`Boolean(${menuItem('Otro')}.querySelector('[data-testid="profile-working"]'))`), false, 'the idle profile shows nothing')
  await settleAnimations()
  await screenshot('profile-working')
  await key('Escape')
  await wait(`!document.querySelector('[role="menuitem"]')`)

  // 3. The pill slides between options (sampled frame by frame).
  await menuShortcut('settings', 'CmdOrCtrl+,')
  await clickText('Proveedores', 'nav button')
  await wait(`Boolean(document.querySelector('[data-testid="resume-setting"] .seg-tab-pill'))`, 30_000)
  await evaluate(`document.querySelector('[data-testid="resume-setting"]').scrollIntoView({ block: 'center' })`)
  await settleAnimations()
  const ends = await evaluate(`(() => {
    const group = document.querySelector('[data-testid="resume-setting"] .seg-tabs')
    const radios = [...group.querySelectorAll('[role="radio"]')]
    const from = radios.find((radio) => radio.getAttribute('aria-checked') === 'true')
    const to = radios.find((radio) => radio !== from)
    to.dataset.target = 'yes'
    return { from: Math.round(from.getBoundingClientRect().left), to: Math.round(to.getBoundingClientRect().left) }
  })()`)
  await evaluate(`(() => { const out = window.__pill = []; const start = performance.now(); const tick = () => { const pill = document.querySelector('[data-testid="resume-setting"] .seg-tab-pill'); if (pill) out.push(Math.round(pill.getBoundingClientRect().left)); if (performance.now() - start < 700) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })();0`)
  await click('[data-testid="resume-setting"] [data-target="yes"]')
  await delay(800)
  const frames = await evaluate('window.__pill')
  const reduced = await evaluate(`document.documentElement.dataset.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches`)
  const between = frames.filter((left) => Math.min(ends.from, ends.to) + 2 < left && left < Math.max(ends.from, ends.to) - 2)
  assert.equal(frames.at(-1), ends.to, `the pill ends on the chosen option (${JSON.stringify({ ends, last: frames.at(-1) })})`)
  if (reduced) assert.equal(between.length, 0, `reduced motion: no steps in between (${JSON.stringify(frames)})`)
  else assert.ok(between.length >= 3, `the pill slides over several frames (${JSON.stringify({ ends, frames: frames.slice(0, 40) })})`)
  await screenshot('pill-moved')
  report({ passed: ['sidebar search clears with its X', 'another profile shows it is working', reduced ? 'pill jumps with reduced motion' : 'pill slides between options'] })
}, { width: 1400, height: 900 })

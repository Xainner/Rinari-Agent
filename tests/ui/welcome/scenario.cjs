// Bienvenida de primer uso (plan 0.4.0 #71) con el Engine real:
// 1. Sin bienvenida vista ni proveedores, sale sola: Rinari de pie en su
//    cuarto (la pose cargada), el paso del nombre y su línea en el cuadro.
// 2. Cada paso cambia la pose cruzando las imágenes (cuadro a cuadro: hay un
//    momento con las dos a medias) y los botones no se mueven de sitio.
// 3. Al terminar va al asistente de proveedores; Ajustes → Memoria → «Sobre ti»
//    enseña lo contado y la repite partiendo de ello.
// 4. En una ventana estrecha, Rinari va arriba y el formulario debajo.
const assert = require('node:assert/strict')
const { clickText, delay, evaluate, input, menuShortcut, report, scenario, screenshot, settleAnimations, size, ui, wait } = require('../harness.cjs')

const DIALOG = '[data-testid="welcome-dialog"]'
const REDUCED = process.env.RINARI_UI_REDUCED_MOTION === '1'
const pose = () => evaluate(`document.querySelector('${DIALOG} .welcome-figure img[data-on]')?.getAttribute('src') ?? ''`)
const actionsTop = () => evaluate(`Math.round(document.querySelector('${DIALOG} .welcome-actions').getBoundingClientRect().top)`)

/** Pulsa «Siguiente» y muestrea la opacidad de las poses en cada cuadro durante 600 ms. */
const nextSampled = () => evaluate(`new Promise((resolve) => {
  const imgs = [...document.querySelectorAll('${DIALOG} .welcome-figure img')]
  const frames = []
  const start = performance.now()
  document.querySelector('[data-testid="welcome-next"]').click()
  const tick = () => {
    frames.push(imgs.map((img) => Number(getComputedStyle(img).opacity)))
    if (performance.now() - start < 600) requestAnimationFrame(tick)
    else resolve(frames)
  }
  requestAnimationFrame(tick)
})`)

scenario(async () => {
  // 1. First use: forget that it was seen and load again.
  await evaluate(`localStorage.removeItem('rinari.welcome.seen')`)
  ui.win.webContents.reload()
  await wait(`Boolean(document.querySelector('${DIALOG}'))`, 60_000)
  await wait(`[...document.querySelectorAll('${DIALOG} .welcome-figure img')].every((img) => img.complete && img.naturalWidth > 0)`)
  await settleAnimations()
  assert.match(await pose(), /vn-hello/, 'she waves on the name step')
  assert.ok(await evaluate(`(() => { const r = document.querySelector('${DIALOG}').getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth })()`), 'the dialog fits the window')
  assert.ok(await evaluate(`document.querySelector('${DIALOG} .welcome-say').innerText.includes('Soy Rinari')`), 'her line is in the speech box')
  await screenshot('01-name')

  // 2. Steps change the pose by crossing the images; the buttons stay put.
  await input(`${DIALOG} .welcome-input-name`, 'Ana')
  const before = await actionsTop()
  const frames = await nextSampled()
  await wait(`document.querySelector('${DIALOG}').dataset.step === 'uses'`)
  if (!REDUCED) assert.ok(frames.some((row) => row.filter((value) => value > 0.05 && value < 0.95).length >= 2), 'two poses cross half-way')
  await settleAnimations()
  assert.match(await pose(), /vn-think/, 'she thinks on the uses step')
  assert.equal(await actionsTop(), before, 'the buttons do not move between steps')
  assert.ok(await evaluate(`document.querySelector('${DIALOG} .welcome-say').innerText.includes('Ana')`), 'she greets by name')
  await clickText('Programar', `${DIALOG} .welcome-chip`, { includes: true })
  await clickText('Investigar', `${DIALOG} .welcome-chip`, { includes: true })
  await clickText('Otro', `${DIALOG} .welcome-chip`, { includes: true })
  await input(`${DIALOG} .welcome-other`, 'Videos')
  assert.equal(await actionsTop(), before, '«Otro» opens without pushing the buttons')
  await settleAnimations()
  await screenshot('02-uses')
  await evaluate(`document.querySelector('[data-testid="welcome-next"]').click()`)
  await wait(`document.querySelector('${DIALOG}').dataset.step === 'preferences'`)
  await input(`${DIALOG} .welcome-textarea`, 'Respuestas cortas, uso Windows.')
  await settleAnimations()
  assert.match(await pose(), /vn-wait/, 'she listens on the last step')
  await screenshot('03-preferences')

  // 3. Finish → the provider wizard; Memory → «Sobre ti» shows it and repeats it.
  await evaluate(`document.querySelector('[data-testid="welcome-finish"]').click()`)
  await wait(`!document.querySelector('${DIALOG}')`)
  await wait(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Configurar después')`)
  await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Configurar después').click()`)
  await delay(400)
  await menuShortcut('settings', 'CmdOrCtrl+,')
  await clickText('Memoria', 'nav button')
  await wait(`document.querySelector('[data-testid="memory-about"]')?.innerText.includes('Ana')`)
  assert.ok(await evaluate(`document.querySelector('[data-testid="memory-about"]').innerText.includes('Videos')`), 'the uses are listed')
  await evaluate(`document.querySelector('[data-testid="memory-about"]').scrollIntoView({ block: 'center' })`)
  await settleAnimations()
  await screenshot('04-about')
  await evaluate(`document.querySelector('[data-testid="memory-about-open"]').click()`)
  await wait(`document.querySelector('${DIALOG} .welcome-input-name')?.value === 'Ana'`)
  await settleAnimations()
  assert.match(await pose(), /vn-wink/, 'repeating it, she winks')
  await screenshot('05-repeat')

  // 4. Narrow window: Rinari above, the form below, nothing out of the window.
  await size(640, 760)
  await settleAnimations()
  const narrow = await evaluate(`(() => { const d = document.querySelector('${DIALOG}').getBoundingClientRect(); const a = document.querySelector('${DIALOG} .welcome-actions').getBoundingClientRect(); const h = document.querySelector('${DIALOG} .welcome-hero').getBoundingClientRect(); return { fits: d.right <= innerWidth && d.bottom <= innerHeight, actionsInside: a.bottom <= d.bottom + 1, stacked: h.bottom <= a.top } })()`)
  assert.deepEqual(narrow, { fits: true, actionsInside: true, stacked: true }, 'stacked layout fits')
  await screenshot('06-narrow')
  report({ passed: ['first use with the standing Rinari', 'poses cross and buttons stay put', 'finish → wizard, «Sobre ti» and repeat', 'narrow layout'] })
}, { width: 1400, height: 900 })

// Una conversación de 10 000 eventos (plan 0.4.0 #91) con el Engine real:
// sembrada antes de arrancar (seed.py), se abre por su última página dentro
// de un tiempo máximo, la página pesa poco y «Cargar anteriores» trae lo de
// antes. Mide desde el clic en la barra lateral hasta la última respuesta
// pintada.
const assert = require('node:assert/strict')
const { click, command, delay, evaluate, reload, report, scenario, screenshot, settleAnimations, until, wait, wheel } = require('../harness.cjs')

/** Abrir en una máquina normal tarda ~1 s; el tope deja margen para la CI cargada. */
const OPEN_LIMIT_MS = 8_000
const PAGE_LIMIT_BYTES = 500_000
const SCROLLER = `[...document.querySelectorAll('.overflow-y-auto')].find((el) => el.innerText.includes('Respuesta'))`
/** Sube la conversación con la rueda, como una persona (como history-and-failure). */
async function up(times = 20) {
  let delta = 1500
  for (let i = 0; i < times; i++) {
    const before = await evaluate(`${SCROLLER}?.scrollTop ?? 0`)
    if (before === 0 && i > 0) return
    await wheel(830, 400, delta)
    await delay(60)
    const after = await evaluate(`${SCROLLER}?.scrollTop ?? 0`)
    if (after > before) delta = -delta
  }
}

scenario(async () => {
  const passed = []
  const { sessions } = await command('session_list', {})
  const grande = sessions.find((item) => item.title === 'Grande')
  assert.ok(grande, 'the seeded conversation is there')

  const pageStarted = Date.now()
  const page = await command('session_timeline', { reference: grande.id, limit: 30 })
  const pageMs = Date.now() - pageStarted
  const bytes = Buffer.byteLength(JSON.stringify(page))
  assert.ok(page.turns.length >= 1 && page.turns.length <= 30, `${page.turns.length} turns in the page`)
  assert.ok(page.has_more, 'older turns stay on disk')
  // «Cargar anteriores» brings turns before the first of this page.
  const firstShown = page.turns[0].turn_index + 1
  assert.ok(bytes < PAGE_LIMIT_BYTES, `the last page weighs ${bytes} bytes`)
  passed.push(`the last page of 10 000 events: ${bytes} bytes in ${pageMs} ms`)

  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  const started = Date.now()
  await evaluate(`[...document.querySelectorAll('aside button')].find((b) => b.textContent.includes('Grande')).click()`)
  await wait(`[...document.querySelectorAll('*')].some((el) => el.childElementCount === 0 && el.textContent.trim() === 'Respuesta 435')`, OPEN_LIMIT_MS)
  const openMs = Date.now() - started
  assert.ok(openMs < OPEN_LIMIT_MS, `opened in ${openMs} ms`)
  await wait(`Boolean(document.querySelector('[data-testid="history-load-earlier"]'))`, 10_000)
  await settleAnimations()
  await screenshot('01-opened')
  passed.push(`it opens by its last answer in ${openMs} ms, with «Cargar anteriores»`)

  await evaluate(`document.querySelector('[data-testid="history-load-earlier"]').click()`)
  // The list is virtual: what arrived above is painted when one scrolls up to it.
  await until(async () => {
    await up()
    const top = await evaluate(`(${SCROLLER}?.innerText ?? '').match(/Pregunta (\\d+)/)?.[1] ?? ''`)
    return Number(top) > 0 && Number(top) < firstShown
  }, 'an earlier turn arrived', 30_000)
  passed.push('«Cargar anteriores» brings the previous page')
  report({ passed })
})

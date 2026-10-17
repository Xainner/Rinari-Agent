// Conversación larga y turno fallido con el Engine real (plan 0.4.0 #70, #68):
// 1. Una conversación de 31 turnos abre por su última página: arriba, el corte
//    «Cargar anteriores»; al pulsarlo llega lo anterior y el corte se va.
// 2. Un turno que no llega al proveedor enseña la ficha «Diagnóstico de la
//    interrupción» plegada; abierta, una lista con etiquetas, y «Copiar
//    diagnóstico» dice «Copiado» en el botón.
const assert = require('node:assert/strict')
const { click, clickText, command, delay, evaluate, input, reload, report, scenario, screenshot, settleAnimations, until, useLocalModel, wait, wheel } = require('../harness.cjs')

const TURNS = 31
const historyTotal = async (id) => (await command('session_history', { reference: id, limit: 1 })).total
const SCROLLER = `[...document.querySelectorAll('.overflow-y-auto')].find((el) => el.innerText.includes('Respuesta'))`
/** Sube la conversación con la rueda, como una persona, hasta arriba del todo. */
async function toTop() {
  let delta = 1500
  for (let i = 0; i < 60; i++) {
    const before = await evaluate(`${SCROLLER}?.scrollTop ?? 0`)
    if (before === 0 && i > 0) return
    await wheel(830, 400, delta)
    await delay(60)
    const after = await evaluate(`${SCROLLER}?.scrollTop ?? 0`)
    if (after > before) delta = -delta
  }
}

scenario(async () => {
  await useLocalModel()

  // 1. Seed a long conversation through the Engine, then open it.
  const created = await command('session_create', { chat: true, title: 'Larga' })
  const id = created.session?.id ?? created.id
  for (let n = 1; n <= TURNS; n++) {
    await command('turn_start', { session_id: id, message: `Pregunta ${n}` })
    await until(async () => (await historyTotal(id)) >= n * 2, `turn ${n} finished`, 30_000)
  }
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Larga', 'aside button', { includes: true })
  await wait(`Boolean(document.querySelector('[data-testid="history-load-earlier"]'))`, 30_000)
  await toTop()
  await settleAnimations()
  await screenshot('01-load-earlier')
  await evaluate(`document.querySelector('[data-testid="history-load-earlier"]').click()`)
  await wait(`!document.querySelector('[data-testid="history-load-earlier"]')`, 30_000)
  // The list is virtual: go to the top and the first turn is painted.
  await until(async () => {
    await toTop()
    return evaluate(`[...document.querySelectorAll('*')].some((el) => el.childElementCount === 0 && el.textContent.trim() === 'Pregunta 1')`)
  }, 'the first turn arrived', 30_000)

  // 2. A turn that cannot reach its provider: the diagnostics card.
  await command('provider_create', { alias: 'caida', provider_type: 'custom', auth_method: 'none', endpoint: 'http://127.0.0.1:9/v1' })
  await command('model_add', { provider: 'caida', provider_model_id: 'nadie', alias: 'caida' })
  await command('model_use', { reference: 'caida' })
  await command('session_create', { chat: true, title: 'Caída' })
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Caída', 'aside button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  await input('.composer-surface textarea', 'Hola')
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await wait(`Boolean(document.querySelector('[data-testid="failure-diagnostics"]'))`, 90_000)
  assert.equal(await evaluate(`document.querySelector('[data-testid="failure-diagnostics"]').open`), false, 'it starts folded')
  await click('[data-testid="failure-diagnostics"] summary')
  await wait(`document.querySelectorAll('[data-testid="failure-diagnostics"] dt').length >= 2`)
  await clickText('Copiar diagnóstico', '[data-testid="failure-diagnostics"] button')
  await wait(`Boolean(document.querySelector('[data-testid="failure-diagnostics"] button[data-copied]'))`)
  assert.ok(await evaluate(`document.querySelector('[data-testid="failure-diagnostics"] button').innerText.includes('Copiado')`))
  await delay(200)
  await screenshot('02-failure-diagnostics')
  report({ realEngine: true, passed: ['long conversation opens on its last page with «Cargar anteriores»', 'failure diagnostics card with labels and «Copiado»'] })
}, { width: 1400, height: 900, timeout: 420_000 })

// Cuando Rinari renombra la conversación, el título cambia con una animación
// breve en el mismo sitio: la fila no cambia de alto mientras dura, y al
// volver a abrir la conversación no se repite.
const assert = require('node:assert/strict')
const { click, clickText, delay, evaluate, input, reload, report, scenario, screenshot, until, useLocalModel, wait, ui } = require('../harness.cjs')

const first = 'Recitame un poema en frances sobre porque los huskies son excelentes perros'
const TITLE = 'Poema francés sobre los huskies'
const release = (lane) => fetch(new URL(`/__release?lane=${lane}`, ui.model).toString())
const pending = (lane) => fetch(new URL(`/__pending?lane=${lane}`, ui.model).toString()).then((r) => r.json())

// Frame by frame: did a swap play in the sidebar, and did its row keep its height?
const SAMPLER = `(() => {
  const probe = window.__titleSwap = { seen: false, heights: [], stop: false }
  const tick = () => {
    const swap = document.querySelector('aside [data-title-swap="in"]')
    if (swap) {
      probe.seen = true
      const row = swap.closest('li') || swap.parentElement
      probe.heights.push(row.getBoundingClientRect().height)
    }
    if (!probe.stop) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})()`

scenario(async () => {
  await useLocalModel()
  await reload()
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Nueva conversación') && b.textContent.includes('Ctrl')).click()`)
  await wait('Boolean(document.querySelector(".composer-surface textarea"))')
  await delay(300)
  await input('.composer-surface textarea', first)
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  // The row shows first with the provisional title («Nueva conversación»); the model's title is held.
  await until(async () => (await pending('title')) > 0, 'the title request reaches the model')
  await wait(`Boolean(document.querySelector('aside button[aria-current="page"] .title-swap-text'))`)
  await evaluate(SAMPLER)
  await release('title')
  await wait(`document.querySelector('aside')?.innerText.includes(${JSON.stringify(TITLE)})`)
  await wait('window.__titleSwap.seen')
  await screenshot('title-swapping')
  await delay(900)
  const probe = await evaluate('(() => { window.__titleSwap.stop = true; return window.__titleSwap })()')
  assert(probe.heights.length >= 3, 'the swap was visible for several frames')
  assert(Math.max(...probe.heights) - Math.min(...probe.heights) <= 0.5, `row height stays put: ${probe.heights}`)
  assert.equal(await evaluate(`Boolean(document.querySelector('[data-title-swap="in"]'))`), false, 'the swap ends')

  // Finish the turn, open another conversation and come back: no replay.
  await until(async () => (await pending('main')) > 0, 'the main request reaches the model')
  await release('main')
  await wait(`document.body.innerText.includes('Les huskies')`)
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Nueva conversación') && b.textContent.includes('Ctrl')).click()`)
  await delay(400)
  await evaluate(SAMPLER)
  await clickText(TITLE, 'aside button', { includes: true })
  await wait(`Boolean(document.querySelector('.composer-surface'))`)
  await delay(900)
  const again = await evaluate('(() => { window.__titleSwap.stop = true; return window.__titleSwap.seen })()')
  assert.equal(again, false, 'reopening the conversation does not replay the swap')
  await screenshot('title-settled')
  report({ passed: ['live rename animates in place', 'row height constant during the swap', 'no replay when reopening'] })
}, { width: 1400, height: 900 })

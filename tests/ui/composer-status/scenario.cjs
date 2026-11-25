// Plan C: what Rinari is doing lives at the top of the composer, not at the top
// of the turn, so it stays in sight in a long conversation. It opens when a
// turn starts (its height grows from 0) and closes when it ends (its height
// folds to 0); the composer's bottom edge never moves. A list of steps shares
// the same bar and opens above it. The tokens are the model's output («↓»).
// The finished turn's card arrives where its operations were.
const assert = require('node:assert/strict')
const { click, command, delay, evaluate, input, reload, report, scenario, screenshot, settleAnimations, ui, until, useLocalModel, wait, clickText } = require('../harness.cjs')

const STATUS = '.composer-surface [data-testid="composer-status"]'
const DOCK = '[data-testid="checklist-dock"]'
const SEND = '.composer-surface button[aria-label="Enviar mensaje"]'
const pending = () => fetch(new URL('/__pending?lane=main', ui.model)).then((r) => r.json())
const release = async () => {
  await until(async () => await pending() > 0, 'the model waits for the next step')
  assert.equal(await fetch(new URL('/__release?lane=main', ui.model)).then((r) => r.json()), true)
}
const has = (selector) => `Boolean(document.querySelector(${JSON.stringify(selector)}))`

/** Samples the status and the composer every frame until `stop()` is evaluated. */
const sample = `(() => { const out = window.__status = []; window.__statusStop = false; const start = performance.now(); const tick = () => { const status = document.querySelector('${STATUS}'); const surface = document.querySelector('.composer-surface'); const r = surface.getBoundingClientRect(); out.push({ t: Math.round(performance.now() - start), h: status ? Math.round(status.getBoundingClientRect().height * 10) / 10 : null, phase: status?.dataset.phase ?? null, top: Math.round(r.top), bottom: Math.round(r.bottom) }); if (!window.__statusStop && performance.now() - start < 8000) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })();0`
const stop = async () => { await evaluate('window.__statusStop = true'); await delay(50); return evaluate('window.__status') }

scenario(async () => {
  await useLocalModel()
  const reduced = await evaluate(`document.documentElement.dataset.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches`)
  await command('session_create', { chat: true, title: 'Estado' })
  await reload()
  await clickText('Estado', 'aside button', { includes: true })
  await wait(has('.composer-surface textarea'))
  assert.equal(await evaluate(has(STATUS)), false, 'nothing above the composer before a turn')

  // 1. A turn starts: the status opens inside the composer, growing from 0.
  await evaluate(sample)
  await input('.composer-surface textarea', 'El login del panel falla. Revísalo.')
  await click(SEND)
  await wait(`document.querySelector('${STATUS}')?.dataset.phase === 'settled'`)
  const opening = await stop()
  const live = '[data-live-activity]'
  assert.equal(await evaluate(`document.querySelectorAll('${live}').length`), 1, 'one live status')
  assert.equal(await evaluate(`Boolean(document.querySelector('${STATUS} ${live}'))`), true, 'the live status is in the composer')
  assert.equal(await evaluate(`Boolean(document.querySelector('[data-activity-turn] ${live}'))`), false, 'and not at the top of the turn')
  const heights = opening.map((frame) => frame.h).filter((h) => h !== null)
  // The first message moves the composer from the middle to the bottom; from here on it stays.
  const bottom = await evaluate(`Math.round(document.querySelector('.composer-surface').getBoundingClientRect().bottom)`)
  if (!reduced) {
    assert(heights.length >= 4 && heights[0] < 8, 'it grows from 0 over several frames: ' + JSON.stringify(heights.slice(0, 20)))
    assert(heights.every((h, i) => i === 0 || h >= heights[i - 1] - 0.5), 'it only grows: ' + JSON.stringify(heights.slice(0, 30)))
  }
  await release()
  await wait(`document.body.innerText.includes('Reviso dónde vive')`)
  await screenshot('live')

  // 2. The list arrives: the same bar shows its step; it opens above the bar.
  await release()
  await wait(has(`${STATUS} ${DOCK}`))
  await wait(`document.querySelector('${STATUS} .turn-line-count')?.textContent === '1/3'`)
  assert.match(await evaluate(`document.querySelector('${STATUS} .turn-line-title').textContent`), /Leyendo el registro/)
  assert.equal(await evaluate(`document.querySelectorAll('${DOCK}').length`), 1, 'one list, inside the composer')
  await screenshot('live-list')
  await click(`${STATUS} .checklist-toggle`)
  await wait(`document.querySelector('${STATUS} .checklist-body')?.hasAttribute('data-open')`)
  await settleAnimations()
  const open = await evaluate(`(() => { const body = document.querySelector('${STATUS} .checklist-body').getBoundingClientRect(); const bar = document.querySelector('${STATUS} .checklist-bar').getBoundingClientRect(); const surface = document.querySelector('.composer-surface').getBoundingClientRect(); return { bodyBottom: body.bottom, barTop: bar.top, items: document.querySelectorAll('${STATUS} .checklist-item').length, surfaceBottom: surface.bottom } })()`)
  assert(open.bodyBottom <= open.barTop + 1, 'the list opens above its bar: ' + JSON.stringify(open))
  assert.equal(open.items, 3)
  assert.equal(Math.round(open.surfaceBottom), bottom, 'opening the list keeps the composer bottom in place')
  await screenshot('live-list-open')
  await click(`${STATUS} .checklist-toggle`)
  await wait(`!document.querySelector('${STATUS} .checklist-body')?.hasAttribute('data-open')`)

  // 3. Reading far above, the status is still in sight.
  await evaluate(`(() => { const el = document.querySelector('.conversation-enter > .overflow-y-auto'); el.dispatchEvent(new WheelEvent('wheel', { deltaY: -600, bubbles: true })); el.scrollTop = 0; el.dispatchEvent(new Event('scroll')) })()`)
  await delay(200)
  const inSight = await evaluate(`(() => { const r = document.querySelector('${STATUS} ${live}').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight })()`)
  assert.equal(inSight, true, 'the status is visible while reading above')

  // 4. The answer streams: the tokens are the model's output.
  await release(); await release(); await release()
  await wait(`document.body.innerText.includes('RESPUESTA DE ESTADO')`, 30_000)
  await wait(`/↓/.test(document.querySelector('${STATUS} [data-testid="token-usage"]')?.textContent ?? '')`)
  const tokens = await evaluate(`document.querySelector('${STATUS} [data-testid="token-usage"]').textContent`)
  assert.match(tokens, /^↓ ~?[\d.,]+( mil| K)? tokens$/, 'output tokens: ' + tokens)
  await screenshot('streaming')

  // 5. The turn ends with a finished list: the bar becomes the list's, and the turn's card arrives.
  await wait(`!document.querySelector('button[aria-label="Detener generación"]')`, 30_000)
  await wait(`document.querySelector('${STATUS} ${DOCK}')?.dataset.state === 'completed'`)
  assert.equal(await evaluate(`Boolean(document.querySelector('${STATUS} ${live}'))`), false, 'no live line once the turn ended')
  await wait(`Boolean(document.querySelector('[data-activity-disclosure="turn"] .is-turn-card'))`)
  const footer = await evaluate(`document.querySelector('[data-testid="turn-meta"] [data-testid="token-usage"]')?.textContent ?? ''`)
  assert.match(footer, /^↓ /, 'the footer counts the output too: ' + footer)
  await settleAnimations()
  await screenshot('ended-list')

  // 6. Dismissing the list closes the status: pinned height folds to 0, the composer bottom stays.
  await evaluate(sample)
  await click(`${STATUS} button[aria-label="Quitar la lista"]`)
  await wait(`!document.querySelector('${STATUS}')`)
  const closing = await stop()
  const closeHeights = closing.map((frame) => frame.h).filter((h) => h !== null)
  assert.deepEqual([...new Set(closing.map((frame) => frame.bottom))], [bottom], 'closing keeps the composer bottom in place')
  if (!reduced) {
    assert(closeHeights.length >= 4, 'it folds over several frames: ' + JSON.stringify(closeHeights))
    assert(closeHeights.every((h, i) => i === 0 || h <= closeHeights[i - 1] + 0.5), 'it only shrinks: ' + JSON.stringify(closeHeights))
  }

  // 7. A turn without a list: the status opens, then closes by itself when it ends.
  await evaluate(sample)
  await input('.composer-surface textarea', 'Otra cosa.')
  await click(SEND)
  await wait(`document.querySelector('${STATUS}')?.dataset.phase === 'settled'`)
  assert.equal(await evaluate(has(`${STATUS} ${DOCK}`)), false, 'no list in a turn without one')
  const reopening = await stop()
  assert.deepEqual([...new Set(reopening.map((frame) => frame.bottom))], [bottom], 'opening keeps the composer bottom in place')
  const reopenHeights = reopening.map((frame) => frame.h).filter((h) => h !== null)
  if (!reduced) assert(reopenHeights.length >= 4 && reopenHeights.every((h, i) => i === 0 || h >= reopenHeights[i - 1] - 0.5), 'it grows again from 0: ' + JSON.stringify(reopenHeights.slice(0, 30)))
  await evaluate(sample)
  await release(); await release()
  await wait(`document.body.innerText.includes('SEGUNDA RESPUESTA')`, 30_000)
  await wait(`!document.querySelector('${STATUS}')`, 30_000)
  const ending = await stop()
  const endHeights = ending.map((frame) => frame.h).filter((h) => h !== null)
  if (!reduced) {
    const tail = endHeights.slice(endHeights.findIndex((h, i) => i > 0 && h < endHeights[i - 1] - 0.5) - 1)
    assert(tail.length >= 4, 'it folds over several frames at the end: ' + JSON.stringify(endHeights.slice(-30)))
  }
  await settleAnimations()
  await screenshot('ended-plain')

  report({ passed: [
    'opens inside the composer when the turn starts, growing from 0',
    'one live status, never at the top of the turn',
    'the list shares the bar and opens above it',
    'in sight while reading above',
    'tokens are the output, in the status and the footer',
    'a finished list keeps the bar; dismissing it folds the status',
    'a turn without a list closes the status when it ends',
    'the composer bottom never moves',
  ], reduced, opening: heights.slice(0, 40), closing: closeHeights, ending: endHeights.slice(-40), tokens, footer })
}, { width: 1400, height: 900 })

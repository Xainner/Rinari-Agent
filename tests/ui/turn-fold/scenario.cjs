const assert = require('node:assert/strict')
const { click, clickText, command, evaluate, input, reload, report, scenario, screenshot, useLocalModel, wait, until, delay, ui } = require('../harness.cjs')

// When a turn ends, its operations fold into the summary card and the row
// loses their height. That space closes with a ghost (--dur-base) instead of
// in one frame; reading the top of the turn, nothing above the fold moves;
// with reduced motion the change is immediate.
const scroller = '.conversation-enter > .overflow-y-auto'
const pending = () => fetch(new URL('/__pending?lane=main', ui.model)).then((r) => r.json())
const release = async () => {
  await until(async () => await pending() > 0, 'model waits for the next step')
  assert.equal(await fetch(new URL('/__release?lane=main', ui.model)).then((r) => r.json()), true)
}
const STEPS = 6

/** Samples the fold frame by frame from the release of the final answer. */
const sampleFold = `(() => { const out = window.__fold = []; const start = performance.now(); const tick = () => { const scroll = document.querySelector('${scroller}'); const turns = document.querySelectorAll('[data-activity-turn]'); const turn = turns[turns.length - 1]; const ghost = document.querySelector('.turn-fold-ghost'); const view = scroll?.getBoundingClientRect(); out.push({ t: Math.round(performance.now() - start), top: turn && view ? Math.round(turn.getBoundingClientRect().top - view.top) : null, ghost: ghost ? Math.round(ghost.getBoundingClientRect().height) : null, done: Boolean(document.querySelector('[data-activity-disclosure="turn"]')), scrollTop: scroll ? Math.round(scroll.scrollTop) : null }); if (performance.now() - start < 2500) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })();0`

async function runTurn(title, reading) {
  await command('session_create', { chat: true, title })
  await reload()
  await clickText(title, 'aside button', { includes: true })
  await input('.composer-surface textarea', 'Revisa los archivos y resume')
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  for (let step = 0; step < STEPS; step++) await release()
  await until(async () => await pending() > 0, 'final answer pending')
  await wait(`document.body.innerText.includes('PASO ${STEPS}')`)
  await delay(400)
  if (reading) {
    // Reading the top of the conversation: the fold happens below.
    await evaluate(`(() => { const el = document.querySelector('${scroller}'); el.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, bubbles: true })); el.scrollTop = 0; el.dispatchEvent(new Event('scroll')) })()`)
    await delay(400)
  }
  await evaluate(sampleFold)
  await release()
  await wait(`Boolean(document.querySelector('[data-activity-disclosure="turn"]'))`)
  await delay(2700)
  return evaluate('window.__fold')
}

scenario(async () => {
  await useLocalModel()
  const reduced = await evaluate(`document.documentElement.dataset.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches`)

  // Following the end: the turn above the result glides instead of jumping.
  const following = await runTurn('Pliegue al final', false)
  await screenshot('folded-following')
  const done = following.findIndex((frame) => frame.done)
  assert(done > 0, 'the fold is sampled: ' + JSON.stringify(following.slice(0, 5)))
  const ghosts = following.filter((frame) => frame.ghost !== null)
  assert.equal(following.at(-1).ghost, null, 'no ghost is left behind')
  const tops = following.slice(done - 1).map((frame) => frame.top).filter((top) => top !== null)
  const total = Math.abs(tops.at(-1) - tops[0])
  const jumps = tops.slice(1).map((top, index) => Math.abs(top - tops[index]))
  if (reduced) {
    assert.equal(ghosts.length, 0, 'reduced motion: the space closes at once')
  } else {
    assert(ghosts.length >= 3, 'the ghost closes over several frames: ' + JSON.stringify(ghosts.map((frame) => frame.ghost)))
    assert(ghosts.every((frame, index) => index === 0 || frame.ghost <= ghosts[index - 1].ghost), 'the ghost only shrinks: ' + JSON.stringify(ghosts.map((frame) => frame.ghost)))
    if (total > 40) assert(Math.max(...jumps) < total * 0.6, `the turn glides, without one jump the size of the fold (${Math.max(...jumps)} px of ${total}): ` + JSON.stringify(tops.slice(0, 30)))
  }

  // Reading the top of the conversation: nothing on screen moves.
  const reading = await runTurn('Pliegue leyendo', true)
  await screenshot('folded-reading')
  const readDone = reading.findIndex((frame) => frame.done)
  assert(readDone > 0, 'the fold is sampled while reading')
  const before = reading[readDone - 1]
  const after = reading.at(-1)
  assert.equal(after.scrollTop, before.scrollTop, 'the reader keeps the scroll position')
  // The fold happens under the summary card: what is above it never moves.
  assert(reading.slice(readDone - 1).every((frame) => frame.top === before.top), 'the turn being read does not move: ' + JSON.stringify(reading.slice(readDone - 1, readDone + 20)))

  report({ reduced, following: { ghosts: ghosts.map((frame) => frame.ghost), total, maxJump: Math.max(0, ...jumps) }, reading: { before, after } })
}, { width: 1500, height: 900 })

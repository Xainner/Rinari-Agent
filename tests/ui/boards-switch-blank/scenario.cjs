// Boards (plan-boards C9): «panel en blanco (0 filas) al pasar de Normal a
// Boards», visto tres veces en uso real. Una conversación larga (la de
// large-history) abierta en Normal, se sube a distintas alturas y se pasa a
// Boards una y otra vez; en cada paso el panel debe mostrar sus mensajes. Si
// alguna vez queda en blanco, guarda la captura y el estado del scroll.
const assert = require('node:assert/strict')
const { click, command, delay, evaluate, report, scenario, screenshot, seedBoard, size, wait, wheel } = require('../harness.cjs')

const ROUNDS = 14
const NORMAL = `[...document.querySelectorAll('.overflow-y-auto')].find((el) => el.innerText.includes('Respuesta'))`
const pane = '[data-pane-id="pane_0"]'
const paneState = `(() => {
  const root = document.querySelector('${pane}')
  const scroller = root?.querySelector('.conversation-enter > .overflow-y-auto')
  const text = scroller?.innerText ?? ''
  return { rows: (text.match(/Respuesta/g) ?? []).length, top: scroller?.scrollTop ?? null, height: scroller?.scrollHeight ?? null, client: scroller?.clientHeight ?? null }
})()`

scenario(async () => {
  await size(1500, 850)
  const { sessions } = await command('session_list', {})
  const grande = sessions.find((item) => item.title === 'Grande')
  assert.ok(grande, 'the seeded conversation is there')
  await seedBoard({ boardId: 'switch_blank', fitToView: true, panes: [{ paneId: 'pane_0', sessionId: grande.id, width: 900, collapsed: false }], focusedPaneId: 'pane_0' }, { open: false })
  await click('.view-switcher button[aria-label="Normal"]')
  await click(`aside button[aria-current], aside li button`)
  await wait(`Boolean(${NORMAL})`, 30000)
  await click('.view-switcher button[aria-label^="Boards"]')
  await wait(`${paneState}.rows > 0`, 30000)
  const samples = []
  for (let round = 0; round < ROUNDS; round++) {
    // A different height of the pane each round: its anchor is what comes
    // back when the pane mounts again after Normal.
    const box = await evaluate(`(() => { const r = document.querySelector('${pane} .conversation-enter > .overflow-y-auto').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`)
    const ups = round % 4
    for (let i = 0; i < ups * 4; i++) {
      await wheel(box.x, box.y, -1400)
      await delay(40)
    }
    if (round % 4 === 0) {
      // Back to the end now and then.
      for (let i = 0; i < 8; i++) { await wheel(box.x, box.y, 4000); await delay(30) }
    }
    await delay(250)
    const before = await evaluate(paneState)
    await click('.view-switcher button[aria-label="Normal"]')
    await wait(`Boolean(${NORMAL})`, 15000)
    if (round % 5 === 4) await size(round % 2 ? 1500 : 1280, 850)
    await click('.view-switcher button[aria-label^="Boards"]')
    await delay(700)
    const after = await evaluate(paneState)
    samples.push({ round, ups, before, after })
    if (after.rows === 0) {
      await screenshot(`blank-round-${round}`)
      assert.fail('the pane is blank after switching back to Boards: ' + JSON.stringify(samples.at(-1)))
    }
  }
  const heights = new Set(samples.map((sample) => sample.before.top))
  assert(heights.size >= 3, 'the pane was at several heights: ' + [...heights].join(', '))
  await screenshot('pane-after-switches')
  report({ rounds: ROUNDS, samples })
})

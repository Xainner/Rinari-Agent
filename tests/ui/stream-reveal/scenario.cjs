// Plan 0.4.0 #52: el modelo falso manda la respuesta en tres trozos grandes
// (una oración larga cada uno). Se muestrea cada cuadro la longitud visible
// del texto vivo: crece de forma gradual, ningún cuadro salta un trozo
// entero, y no hay cursor parpadeante al final (lo quitó el dueño). Al terminar
// se ve todo. Con RINARI_UI_REDUCED_MOTION=1 el texto sale tal como llega.
const assert = require('node:assert/strict')
const { click, clickText, command, evaluate, input, reload, report, scenario, screenshot, useLocalModel, wait } = require('../harness.cjs')

const reduced = process.env.RINARI_UI_REDUCED_MOTION === '1'
const CHUNK = 220

scenario(async () => {
  await useLocalModel()
  await command('session_create', { chat: true, title: 'Revelado suave' })
  await reload()
  await clickText('Revelado suave', 'aside button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  await input('.composer-surface textarea', 'Cuéntame qué pasó con la caja.')
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await evaluate(`(() => {
    const state = window.__reveal = { lengths: [], revealFrames: 0, caretFrames: 0, frames: 0, done: false }
    const tick = () => {
      const live = document.querySelector('.turn-rail[data-live="true"] .md-body')
      if (live) {
        state.frames += 1
        // Lo visible: el texto recibido menos las palabras que esperan invisibles.
        const waiting = [...live.querySelectorAll('.sw-wait')].reduce((n, word) => n + word.textContent.length, 0)
        const length = live.textContent.length - waiting
        if (state.lengths.at(-1) !== length) state.lengths.push(length)
        if (live.hasAttribute('data-streaming')) state.revealFrames += 1
        // Ningún cursor pintado tras la última palabra visible.
        const edge = live.querySelector('.sw-edge')
        if (edge && getComputedStyle(edge, '::after').content !== 'none') state.caretFrames += 1
      }
      if (!state.done) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })()`)
  await wait(`Boolean(document.querySelector('.md-body[data-streaming]')) || ${reduced}`, 30_000)
  if (!reduced) {
    await wait(`document.querySelectorAll('.md-body[data-streaming] .sw:not(.sw-wait)').length > 6`)
    await screenshot('revealing')
  }
  await wait(`document.body.innerText.includes('FIN DEL INFORME')`, 60_000)
  await wait(`!document.querySelector('button[aria-label="Detener generación"]')`, 60_000)
  const result = await evaluate(`(() => { const s = window.__reveal; s.done = true; const jumps = s.lengths.map((l, i) => i ? l - s.lengths[i - 1] : l); return { frames: s.frames, steps: s.lengths.length, maxJump: Math.max(0, ...jumps), revealFrames: s.revealFrames, caretFrames: s.caretFrames } })()`)
  assert.equal(result.caretFrames, 0, `no blinking cursor after the text: ${JSON.stringify(result)}`)
  if (reduced) {
    assert.equal(result.revealFrames, 0, `reduced motion: no reveal: ${JSON.stringify(result)}`)
  } else {
    assert(result.steps >= 12, `the text should grow over many frames: ${JSON.stringify(result)}`)
    assert(result.maxJump < CHUNK * 0.6, `no frame shows a whole chunk at once: ${JSON.stringify(result)}`)
    assert(result.revealFrames > 10, `the text reveals word by word while it arrives: ${JSON.stringify(result)}`)
  }
  const final = await evaluate(`document.querySelector('[data-testid="turn-result"]').innerText`)
  assert.match(final, /FIN DEL INFORME/)
  assert.equal(await evaluate(`Boolean(document.querySelector('.md-body[data-streaming]'))`), false, 'no reveal left once the turn ends')
  await screenshot('done')
  report({ passed: [reduced ? 'reduced motion: the text arrives as is' : 'three big chunks reveal gradually', 'no blinking cursor after the text', 'the whole answer is there at the end'], metrics: result })
}, { width: 1300, height: 820 })

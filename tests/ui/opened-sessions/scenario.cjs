// Filas de las sesiones que abrió un turno y «Enviar ahora» en la nota de un
// mensaje en espera (plan 0.4.0 v3 P7, P8), con el Engine real:
// 1. Un turno abre una hija: su fila queda fija debajo del resultado de ese
//    turno, separada de él y sin botones de rama; la hija abre a su vez una
//    nieta, que en la barra lateral cuelga de la misma raíz, con la misma
//    sangría que la hija y después de ella (por nacimiento, como Claude Code).
// 2. Un mensaje enviado mientras Rinari responde espera con «Lo leerá al
//    terminar el paso actual · Enviar ahora»; el enlace es más discreto que
//    la burbuja y pulsarlo corta el paso: «Cortando el paso para leerlo ya».
const assert = require('node:assert/strict')
const { click, clickText, command, evaluate, input, key, reload, report, scenario, screenshot, settleAnimations, ui, until, useLocalModel, wait } = require('../harness.cjs')

const text = (value) => `document.body.innerText.includes(${JSON.stringify(value)})`
const OPENED = '[data-testid="opened-sessions"]'
const LINK = '[data-testid="steer-send-now"]'
const reduced = process.env.RINARI_UI_REDUCED_MOTION === '1'
const pending = () => fetch(new URL('/__pending?lane=main', ui.model)).then((r) => r.json())
async function release() {
  await until(async () => await pending() > 0, 'model waits for the next step')
  assert.equal(await fetch(new URL('/__release?lane=main', ui.model)).then((r) => r.json()), true)
}
async function send(message, modifiers) {
  await input('.composer-surface textarea', message)
  await click('.composer-surface textarea')
  await key('Enter', modifiers)
}
const rect = (selector) => evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null })()`)

scenario(async () => {
  await useLocalModel()
  await command('session_create', { chat: true, title: 'Docs' })
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Docs', 'aside li button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')

  // 1. The turn opens a child: a fixed row under that turn's result.
  await send('Revisa los docs en otra sesión')
  await release() // session.start
  await release() // «La abrí aparte.»
  await wait(text('La abrí aparte.'))
  await wait(`Boolean(document.querySelector('${OPENED} [data-testid="child-card"]'))`)
  const row = `${OPENED} [data-testid="child-card"]`
  assert.ok(await evaluate(`document.querySelector('${row}').textContent.includes('Revisar docs')`), 'the row names the child')
  assert.equal(await evaluate(`Boolean(document.querySelector('${OPENED} .child-row-actions'))`), false, 'no branch buttons in the turn')
  // The row sits after the result and before the turn's meta line, with room above.
  const gap = await evaluate(`(() => {
    const opened = document.querySelector('${OPENED}')
    const result = opened.previousElementSibling
    return result ? Math.round(opened.getBoundingClientRect().top - result.getBoundingClientRect().bottom) : null
  })()`)
  assert.ok(gap !== null && gap >= 8, `the row is apart from the result (${gap} px)`)
  // The meta line comes when the turn ends, a moment after its last words.
  await wait(`Boolean(document.querySelector('${OPENED}')?.nextElementSibling)`)
  const below = await evaluate(`(() => {
    const opened = document.querySelector('${OPENED}')
    const meta = opened.nextElementSibling
    return meta ? Math.round(meta.getBoundingClientRect().top - opened.getBoundingClientRect().bottom) : null
  })()`)
  assert.ok(below !== null && below >= 12, `the turn's meta line keeps its room under the row (${below} px)`)
  // The grandchild hangs from the same root, at the child's indent and after it.
  await wait(`[...document.querySelectorAll('aside [data-testid="session-children"] li')].some((li) => li.textContent.includes('Arreglar enlaces'))`)
  const kids = await evaluate(`[...document.querySelectorAll('aside [data-testid="session-children"] > li')].map((li) => ({ text: li.textContent, x: Math.round(li.getBoundingClientRect().x) }))`)
  const at = (title) => kids.findIndex((kid) => kid.text.includes(title))
  assert.ok(at('Revisar docs') >= 0 && at('Arreglar enlaces') > at('Revisar docs'), `the grandchild comes after the child (${JSON.stringify(kids)})`)
  assert.equal(kids[at('Arreglar enlaces')].x, kids[at('Revisar docs')].x, 'one indent for the child and the grandchild')
  await wait(text('INFORME LEÍDO'))
  await settleAnimations()
  await screenshot('opened-row')

  // 2. A message sent while Rinari answers waits, with «Enviar ahora» in its note.
  await send('Ahora mira el changelog')
  await until(async () => await pending() > 0, 'the answer is held')
  await send('Para: empieza por la 0.4')
  await wait(`Boolean(document.querySelector('${LINK}'))`)
  const look = await evaluate(`(() => {
    const link = document.querySelector('${LINK}')
    const note = link.closest('.steer-note')
    const bubble = link.closest('[data-testid="steer-message"]').querySelector('.steer-bubble')
    const size = (el) => parseFloat(getComputedStyle(el).fontSize)
    return { link: size(link), note: size(note), bubble: size(bubble), height: Math.round(link.getBoundingClientRect().height), text: note.textContent }
  })()`)
  assert.ok(look.link <= look.bubble - 2, `the link is quieter than the bubble (${JSON.stringify(look)})`)
  assert.ok(look.text.includes('Enviar ahora'), 'the note offers «Enviar ahora»')
  await settleAnimations()
  await screenshot('steer-pending')
  // «N conversaciones terminaron» (the children above) may still sit over the note.
  await wait(`(() => { const l = document.querySelector('${LINK}'); const r = l.getBoundingClientRect(); const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return Boolean(at && (at === l || l.contains(at))) })()`, 15_000)
  await click(LINK)
  await wait(`document.querySelector('[data-testid="steer-message"]')?.dataset.interrupted === 'true'`)
  assert.ok(await evaluate(text('Cortando el paso para leerlo ya')) || await evaluate(text('Interrumpió el paso')), 'the note says the step is cut')
  await release() // the answer that gets cut
  await release() // the answer after reading the message
  await wait(text('LEÍ EL MENSAJE'))
  assert.equal(await evaluate(text('TEXTO QUE NO SE VE')), false, 'the cut answer is not written')
  await settleAnimations()
  await screenshot('steer-sent')
  report({ passed: ['opened session row under its turn', 'grandchild under the root at the child indent', '«Enviar ahora» in the waiting note', 'the link cuts the step'], reduced })
}, { width: 1280, height: 860 })

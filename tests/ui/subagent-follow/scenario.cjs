// «Ver actividad» de un subagente sigue su final mientras se lee abajo, se
// pausa al subir (solo en esa tarjeta) y vuelve con «Ir al final». El
// subagente avanza paso a paso: el modelo falso retiene cada respuesta suya.
const assert = require('node:assert/strict')
const { click, clickText, command, evaluate, input, panesFor, seedBoard, report, scenario, screenshot, settleAnimations, toggleDockView, until, useLocalModel, wait, delay, ui } = require('../harness.cjs')
/** La geometría de un riel (#10, #21): el eje de la línea frente al de cada bolita, y la pista frente a la primera y la última. */
function railGeometry(railSelector, nodeSelector, pseudo) {
  return `(() => {
    const rail = document.querySelector(${JSON.stringify(railSelector)})
    if (!rail) return null
    const box = rail.getBoundingClientRect()
    const line = getComputedStyle(rail, '::before')
    const lineX = box.left + parseFloat(line.left) + parseFloat(line.width) / 2
    const start = box.top + parseFloat(line.top)
    const end = start + parseFloat(line.height)
    const nodes = [...rail.querySelectorAll(${JSON.stringify(nodeSelector)})].map((el) => {
      const r = el.getBoundingClientRect()
      if (!${JSON.stringify(pseudo)}) return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      const s = getComputedStyle(el, ${JSON.stringify(pseudo)})
      return { x: r.left + parseFloat(s.left) + parseFloat(s.width) / 2, y: r.top + parseFloat(s.top) + parseFloat(s.height) / 2 }
    })
    return { lineX, start, end, nodes, track: rail.dataset.track }
  })()`
}
function assertRail(geom, label) {
  assert.ok(geom && geom.nodes.length >= 2, `${label}: a rail with at least two nodes (${JSON.stringify(geom)})`)
  for (const node of geom.nodes) assert.ok(Math.abs(node.x - geom.lineX) <= 1, `${label}: the line is centered on every node (${JSON.stringify(geom)})`)
  assert.ok(Math.abs(geom.start - geom.nodes[0].y) <= 1, `${label}: the line starts at the first node (${JSON.stringify(geom)})`)
  assert.ok(Math.abs(geom.end - geom.nodes.at(-1).y) <= 1, `${label}: the line ends at the last node (${JSON.stringify(geom)})`)
}


const card = '[data-testid="agent-card"]'
const box = '[data-testid="agent-activity"]'
const atEnd = `(() => {const el=document.querySelector(${JSON.stringify(box)});return el.scrollHeight-el.scrollTop-el.clientHeight<=24})()`
const release = () => fetch(new URL('/__release?lane=sub', ui.model).toString()).then((r) => r.json())
const pending = () => fetch(new URL('/__pending?lane=sub', ui.model).toString()).then((r) => r.json())

async function step(n) {
  await until(async () => (await pending()) > 0, 'subagent step ' + n + ' reaches the model')
  assert.equal(await release(), true)
  await wait(`document.querySelector(${JSON.stringify(box)})?.textContent.includes(${JSON.stringify('Paso ' + n + ' del subagente')})`)
  await delay(250)
}

scenario(async () => {
  await useLocalModel()
  const session = (await command('session_create', { chat: true, title: 'Subagente' })).session.id
  await seedBoard({ boardId: 'subagent-inspection', panes: panesFor([session]), focusedPaneId: 'pane_0' })
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Subagente', 'aside button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  await input('.composer-surface textarea', 'Revisa esto con un subagente')
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await wait(`Boolean(document.querySelector('button[aria-label="Ver operaciones"]'))`)
  await click('button[aria-label="Ver operaciones"]')
  await wait(`Boolean(document.querySelector(${JSON.stringify(card)}))`)
  await click(card + ' > summary')
  await wait(`document.querySelector(${JSON.stringify(card)}).open`)
  await step(1)
  await step(2)
  await step(3)
  assert(await evaluate(`document.querySelector(${JSON.stringify(box)}).scrollHeight > document.querySelector(${JSON.stringify(box)}).clientHeight + 200`), 'the activity overflows its box')
  await wait(atEnd)
  await screenshot('following')
  const outer = await evaluate(`document.querySelector('.conversation-enter > .overflow-y-auto').scrollTop`)
  await evaluate(`(() => {const el=document.querySelector(${JSON.stringify(box)});el.scrollTop=0;el.dispatchEvent(new Event('scroll'))})()`)
  await wait(`[...document.querySelectorAll(${JSON.stringify(card + ' button')})].some(b=>b.textContent==='Ir al final')`)
  await click('.view-switcher button[aria-label^="Boards"]')
  await wait(`Boolean(document.querySelector(${JSON.stringify(box)}))`)
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(box)}).scrollTop`), 0, 'paused inspection is restored in Boards')
  await step(4)
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(box)}).scrollTop`), 0, 'reading up pauses the follow')
  await screenshot('paused')
  await click('.view-switcher button[aria-label="Normal"]')
  await wait(`Boolean(document.querySelector(${JSON.stringify(box)}))`)
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(box)}).scrollTop`), 0, 'paused inspection is restored in Normal')
  await clickText('Ir al final', card + ' button')
  await wait(atEnd)
  await step(5)
  await wait(atEnd)
  // El resumen final también queda a la vista.
  await until(async () => (await pending()) > 0, 'subagent summary reaches the model')
  await release()
  await wait(`document.body.innerText.includes('FIN DEL COORDINADOR')`)
  await wait(`Boolean(document.querySelector('button[aria-label="Ver actividad del turno"]'))`)
  await click('button[aria-label="Ver actividad del turno"]')
  await wait(atEnd)
  await screenshot('finished')
  assert.equal(await pending(), 0)
  // The chat's rail goes from node to node, centered (#10).
  await settleAnimations()
  assertRail(await evaluate(railGeometry('.turn-rail', ':scope > * > .turn-node', null)), 'turn rail')
  // The subagent's steps in the side panel, the same (#21).
  await toggleDockView('agents')
  await wait(`Boolean(document.querySelector('button.agent-entry'))`)
  await click('button.agent-entry')
  await wait(`document.querySelectorAll('.agent-steps > li.agent-step').length >= 2`)
  await delay(200)
  assertRail(await evaluate(railGeometry('.agent-steps', ':scope > li.agent-step', '::before')), 'agent steps')
  await screenshot('agent-steps')
  report({ passed: ['rails centered and from node to node', 'opens at the end while running', 'follows new steps', 'pauses when reading up and across Normal/Boards', 'Ir al final resumes', 'final summary stays in view'], outerScrollTop: outer })
}, { width: 1400, height: 900 })

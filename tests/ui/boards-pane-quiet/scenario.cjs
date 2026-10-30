// Boards (plan-boards C1): al enviar en un panel, la fila viva del turno no
// aparece mientras Rinari solo prepara el turno o piensa; eso ya lo dice la
// cara de Rinari en la cabecera del panel. Se muestrea cuadro a cuadro desde
// el envío hasta que el modelo (retenido) responde. Con la respuesta, sí hay
// algo que contar y el resultado se ve.
const assert = require('node:assert/strict')
const { ui, click, command, evaluate, input, report, scenario, screenshot, seedBoard, panesFor, until, useLocalModel, wait } = require('../harness.cjs')

const origin = () => ui.model.replace(/\/v1$/, '')
const pane = '[data-pane-id="pane_0"]'

scenario(async () => {
  await useLocalModel()
  const id = (await command('session_create', { chat: true, title: 'Panel en silencio' })).session.id
  await seedBoard({ boardId: 'pane_quiet', panes: panesFor([id], 700), focusedPaneId: 'pane_0' })
  await wait(`Boolean(document.querySelector('${pane} .composer-surface textarea'))`)
  await evaluate(`(() => {
    const out = window.__quietFrames = []
    window.__quietStop = false
    const tick = () => {
      const root = document.querySelector('${pane}')
      out.push({
        live: Boolean(root?.querySelector('[data-live-activity]')),
        preparing: Boolean(root?.innerText.includes('Preparando el turno')),
        face: root?.querySelector('.pane-header-face') ? 1 : 0,
      })
      if (!window.__quietStop) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })();0`)
  await input(pane + ' .composer-surface textarea', 'Responde en el panel')
  await click(pane + ' .composer-surface button[aria-label="Enviar mensaje"]')
  await until(async () => (await (await fetch(origin() + '/__pending')).json()) === true, 'the real Engine reaches the held model request')
  // Más que la llegada del mensaje (500 ms) y el mínimo de 300 ms: un equipo
  // ocupado se queda aquí, y la fila no debe salir en ningún cuadro.
  await new Promise((resolve) => setTimeout(resolve, 1500))
  const frames = await evaluate(`window.__quietFrames.slice()`)
  assert(frames.length > 20, 'frames were sampled while the turn prepared and thought: ' + frames.length)
  assert.equal(frames.filter((frame) => frame.live).length, 0, 'no live activity row in the pane before there is something to tell')
  assert.equal(frames.filter((frame) => frame.preparing).length, 0, '«Preparando el turno…» never shows in the pane')
  assert(frames.every((frame) => frame.face === 1), 'Rinari\'s face stays in the pane header')
  await screenshot('pane-waiting')
  const release = await (await fetch(origin() + '/__release')).json()
  assert.equal(release.wasConnected, true)
  await wait(`document.querySelector('${pane}')?.innerText.includes('RESPUESTA DEL PANEL')`)
  await evaluate(`window.__quietStop = true;0`)
  await screenshot('pane-answered')
  report({ frames: frames.length, live: 0, preparing: 0 })
})

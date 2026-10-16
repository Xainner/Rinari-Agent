// Cambios del turno (plan 0.4.0 #41) con el Engine real, en una carpeta sin git:
// 1. El modelo falso modifica un archivo y crea otro: la tarjeta del chat dice
//    «2 archivos cambiados» con el tipo de cada uno y su +/−.
// 2. «Revisar» abre la vista Cambios del panel lateral en ese turno, con el diff
//    a color (sin git); un archivo de la tarjeta la abre en ese archivo.
// 3. «Revisar cambios» de la fila de abajo lleva al mismo sitio.
// 4. «Abrir archivo» lo lleva a la vista Archivos.
const assert = require('node:assert/strict')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { ui, click, clickText, command, evaluate, input, reload, report, scenario, screenshot, settleAnimations, size, useLocalModel, wait } = require('../harness.cjs')

const DOCK = '[data-testid="session-dock"]'
const CARD = '[data-testid="turn-changes"]'

scenario(async () => {
  await useLocalModel()
  const root = join(ui.data, 'Caja')
  mkdirSync(join(root, 'src', 'caja'), { recursive: true })
  writeFileSync(join(root, 'src', 'caja', 'ticket.ts'), "export function ticket(code: string) {\n  return `Ticket ${code}`\n}\n")
  const { project } = await command('project_add', { path: root, name: 'Caja' })
  await command('session_create', { project_id: project.id, title: 'Ticket con QR', permission_profile: 'full-access' })
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Ticket con QR', 'aside li button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  await input('.composer-surface textarea', 'Añade el QR al ticket')
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await wait(`document.body.innerText.includes('QR LISTO')`)

  // 1. The card, new style.
  await wait(`document.querySelector('${CARD}')?.innerText.includes('2 archivos cambiados')`)
  const card = await evaluate(`document.querySelector('${CARD}').innerText`)
  assert.match(card, /modificado/)
  assert.match(card, /creado/)
  assert.doesNotMatch(card, /archivo\(s\)/, 'no «archivo(s)» plural any more')
  await settleAnimations()
  await screenshot('card')

  // The finished turn wears the working card's frame: same height, Rinari's face, chevron on the right.
  const done = await evaluate(`(() => { const card = document.querySelector('.disclosure-button.is-turn-card'); if (!card) return null; const r = card.getBoundingClientRect(); const face = card.querySelector('.rinari-avatar')?.getBoundingClientRect(); const chevron = card.querySelector('.turn-done-chevron')?.getBoundingClientRect(); const turn = card.closest('[data-activity-turn]').getBoundingClientRect(); return { h: Math.round(r.height), full: Math.round(turn.width - r.width), face: face ? Math.round(face.width) : 0, chevronRight: chevron ? Math.round(r.right - chevron.right) : -1, text: card.innerText } })()`)
  assert.ok(done && done.h >= 62 && done.h <= 68 && done.full <= 1, 'finished turn card has the working card size: ' + JSON.stringify(done))
  assert.ok(done.face >= 36 && done.chevronRight >= 0 && done.chevronRight < 24 && /Ha trabajado durante/.test(done.text), 'finished card: face, title and chevron on the right: ' + JSON.stringify(done))

  // 2. «Revisar»: the turn in the side panel, with the coloured diff, without git.
  await clickText('Revisar', `${CARD} button`)
  await wait(`document.querySelector('${DOCK}')?.dataset.views?.includes('changes')`)
  await wait(`Boolean(document.querySelector('${DOCK} [data-testid="turn-diff"] .diff-row.is-add'))`)
  assert.equal(await evaluate(`Boolean(document.querySelector('${DOCK} [role="radiogroup"][aria-label="Qué cambios ver"]'))`), false, 'no repo scope without git')
  await clickText('src/caja/qr.ts', `${CARD} .turn-changes-path`, { includes: true })
  await wait(`document.querySelector('${DOCK} [data-testid="turn-diff"]')?.dataset.path === 'src/caja/qr.ts'`)
  await settleAnimations()
  // The diff takes the whole height of the view, not the 28rem cap it has elsewhere.
  const fill = await evaluate(`(() => { const box = document.querySelector('${DOCK} [data-testid="turn-diff"]').getBoundingClientRect(); const view = document.querySelector('${DOCK} [data-testid="turn-diff"] .diff-view').getBoundingClientRect(); return { gap: Math.round(box.bottom - view.bottom), cap: getComputedStyle(document.querySelector('${DOCK} [data-testid="turn-diff"] .diff-body')).maxHeight } })()`)
  assert.ok(fill.gap <= 2 && fill.cap === 'none', 'the diff fills the Changes view: ' + JSON.stringify(fill))
  await screenshot('review-in-panel')

  // 3. «Revisar cambios» from the footer goes to the same view.
  await click(`${DOCK} button[aria-label="Cerrar Cambios"]`)
  await wait(`!document.querySelector('${DOCK}')`)
  await clickText('Revisar cambios', '[data-testid="turn-meta"] button', { includes: true })
  await wait(`Boolean(document.querySelector('${DOCK} [data-testid="turn-diff"] .diff-row'))`)

  // 4. «Abrir archivo» opens it in Files.
  await clickText('Abrir archivo', `${DOCK} [data-testid="turn-diff"] button`, { includes: true })
  await wait(`document.querySelector('${DOCK}')?.dataset.views?.includes('files')`)
  await settleAnimations()
  await screenshot('open-in-files')
  // #82: el Resumen flota sobre el chat: no toca las vistas del panel ni el ancho del chat, entra
  // con movimiento (muestreado cuadro a cuadro) y no baja hasta el composer. «Cambios» abre la vista y lo cierra.
  const before = await evaluate(`({ chat: Math.round(document.querySelector('.session-workspace-chat').getBoundingClientRect().width), views: document.querySelector('${DOCK}')?.dataset.views })`)
  const frames = await evaluate(`new Promise((resolve) => {
    document.querySelector('.dock-view-bar button[data-view="summary"]').click()
    const out = []
    const start = performance.now()
    const tick = () => {
      const summary = document.querySelector('[data-testid="summary-dock"]')
      out.push({ opacity: summary ? Number(getComputedStyle(summary).opacity) : null, chat: Math.round(document.querySelector('.session-workspace-chat').getBoundingClientRect().width) })
      if (performance.now() - start < 600) requestAnimationFrame(tick)
      else resolve(out)
    }
    requestAnimationFrame(tick)
  })`)
  assert.ok(frames.every((frame) => frame.chat === before.chat), 'the chat keeps its width while the summary opens: ' + JSON.stringify(frames.map((frame) => frame.chat)))
  if (!(await evaluate(`matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced'`))) {
    assert.ok(frames.some((frame) => frame.opacity !== null && frame.opacity > 0.02 && frame.opacity < 0.98), 'the summary fades in over several frames: ' + JSON.stringify(frames.map((frame) => frame.opacity)))
  }
  assert.equal(frames.at(-1).opacity, 1, 'the summary ends fully visible')
  await wait(`Boolean(document.querySelector('[data-testid="summary-panel"]'))`)
  assert.equal(await evaluate(`document.querySelector('${DOCK}')?.dataset.views`), before.views, 'the side panel keeps its views under the summary')
  const fit = await evaluate(`(() => { const s = document.querySelector('[data-testid="summary-dock"]').getBoundingClientRect(); const chat = document.querySelector('.session-workspace-chat').getBoundingClientRect(); const slot = document.querySelector('.session-workspace-chat .conversation-composer-slot').getBoundingClientRect(); return { inside: s.left >= chat.left && s.right <= chat.right + 0.5, bottom: Math.round(s.bottom), composer: Math.round(slot.top) } })()`)
  assert.ok(fit.inside, 'the summary floats inside the chat column, not over the side panel')
  assert.ok(fit.bottom <= fit.composer, `the summary stays above the composer (${fit.bottom} > ${fit.composer})`)
  await wait(`document.querySelector('[data-testid="summary-panel"] [data-card="env"]')?.innerText.includes('Caja') || document.querySelector('[data-testid="summary-panel"] [data-card="env"]')?.innerText.includes('sin git')`)
  await wait(`Boolean(document.querySelector('[data-testid="summary-panel"] [data-card="changes"]'))`)
  await settleAnimations()
  await screenshot('summary')
  await click('[data-testid="summary-panel"] [data-card="changes"] .summary-card-open')
  await wait(`document.querySelector('${DOCK}')?.dataset.views?.includes('changes') && !document.querySelector('[data-testid="summary-panel"]')`)
  await click('.dock-view-bar button[data-view="summary"]')
  await wait(`Boolean(document.querySelector('[data-testid="summary-panel"]'))`)
  await click('.dock-view-bar button[data-view="summary"]')
  await wait(`!document.querySelector('[data-testid="summary-panel"]')`)
  assert.ok(await evaluate(`document.querySelector('${DOCK}')?.dataset.views?.includes('changes')`), 'closing the summary leaves the side panel as it was')
  // With the chat too narrow the summary steps aside (still open) and comes back by itself with room.
  await click('.dock-view-bar button[data-view="summary"]')
  await wait(`Boolean(document.querySelector('[data-testid="summary-panel"]'))`)
  await size(900, 800)
  await wait(`document.querySelector('.session-workspace-chat').getBoundingClientRect().width < 720 && !document.querySelector('[data-testid="summary-dock"]')`)
  assert.equal(await evaluate(`document.querySelector('.dock-view-bar button[data-view="summary"]').getAttribute('aria-pressed')`), 'true', 'the summary is still open while it steps aside')
  await size(1500, 900)
  await wait(`Boolean(document.querySelector('[data-testid="summary-panel"]'))`)
  await click('.dock-view-bar button[data-view="summary"]')
  await wait(`!document.querySelector('[data-testid="summary-panel"]')`)

  // #83: la barra de título solo lleva el título; nada se monta encima del selector, ni a 900 px.
  assert.equal(await evaluate(`Boolean(document.querySelector('.app-topbar-context button'))`), false, 'no project or mode chip in the title bar')
  await size(900, 800)
  await settleAnimations()
  const overlap = await evaluate(`(() => { const title = document.querySelector('.app-topbar-context p')?.getBoundingClientRect(); const view = document.querySelector('.view-switcher')?.getBoundingClientRect(); return title && view ? { right: Math.round(title.right - view.left), width: Math.round(title.width) } : null })()`)
  assert.ok(overlap && overlap.width > 40, `the title is still visible at 900 px (${JSON.stringify(overlap)})`)
  assert.ok(overlap.right <= 0, `the title never runs under the view switcher (${JSON.stringify(overlap)})`)
  await screenshot('title-bar-900')
  report({ passed: ['summary floats over the chat without touching the side panel, steps aside when the chat is narrow and comes back, its Changes card opens the view', 'card with plural, kinds and +/-', 'title bar only the title, no overlap at 900 px', 'review opens the turn diff in the panel without git, at full height', 'a file of the card opens on that file', 'footer review goes to the same view', 'open file goes to Files'] })
}, { width: 1500, height: 900 })

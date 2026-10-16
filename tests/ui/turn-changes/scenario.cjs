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

  // 2. «Revisar»: the turn in the side panel, with the coloured diff, without git.
  await clickText('Revisar', `${CARD} button`)
  await wait(`document.querySelector('${DOCK}')?.dataset.views?.includes('changes')`)
  await wait(`Boolean(document.querySelector('${DOCK} [data-testid="turn-diff"] .diff-row.is-add'))`)
  assert.equal(await evaluate(`Boolean(document.querySelector('${DOCK} [role="radiogroup"][aria-label="Qué cambios ver"]'))`), false, 'no repo scope without git')
  await clickText('src/caja/qr.ts', `${CARD} .turn-changes-path`, { includes: true })
  await wait(`document.querySelector('${DOCK} [data-testid="turn-diff"]')?.dataset.path === 'src/caja/qr.ts'`)
  await settleAnimations()
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
  // #82: el Resumen sustituye a las vistas; «Cambios» abre la vista y lo cierra; volver a él.
  await click('.dock-view-bar button[data-view="summary"]')
  await wait(`Boolean(document.querySelector('[data-testid="summary-panel"]'))`)
  assert.equal(await evaluate(`Boolean(document.querySelector('${DOCK}'))`), false, 'summary and views are exclusive')
  await wait(`document.querySelector('[data-testid="summary-panel"] [data-card="env"]')?.innerText.includes('Caja') || document.querySelector('[data-testid="summary-panel"] [data-card="env"]')?.innerText.includes('sin git')`)
  await wait(`Boolean(document.querySelector('[data-testid="summary-panel"] [data-card="changes"]'))`)
  await settleAnimations()
  await screenshot('summary')
  await click('[data-testid="summary-panel"] [data-card="changes"] .summary-card-open')
  await wait(`document.querySelector('${DOCK}')?.dataset.views?.includes('changes') && !document.querySelector('[data-testid="summary-panel"]')`)
  await click('.dock-view-bar button[data-view="summary"]')
  await wait(`Boolean(document.querySelector('[data-testid="summary-panel"]'))`)
  await click('.dock-view-bar button[data-view="summary"]')
  await wait(`Boolean(document.querySelector('${DOCK}')) && !document.querySelector('[data-testid="summary-panel"]')`)

  // #83: la barra de título solo lleva el título; nada se monta encima del selector, ni a 900 px.
  assert.equal(await evaluate(`Boolean(document.querySelector('.app-topbar-context button'))`), false, 'no project or mode chip in the title bar')
  await size(900, 800)
  await settleAnimations()
  const overlap = await evaluate(`(() => { const title = document.querySelector('.app-topbar-context p')?.getBoundingClientRect(); const view = document.querySelector('.view-switcher')?.getBoundingClientRect(); return title && view ? { right: Math.round(title.right - view.left), width: Math.round(title.width) } : null })()`)
  assert.ok(overlap && overlap.width > 40, `the title is still visible at 900 px (${JSON.stringify(overlap)})`)
  assert.ok(overlap.right <= 0, `the title never runs under the view switcher (${JSON.stringify(overlap)})`)
  await screenshot('title-bar-900')
  report({ passed: ['summary replaces the views, its Changes card opens the view', 'card with plural, kinds and +/-', 'title bar only the title, no overlap at 900 px', 'review opens the turn diff in the panel without git', 'a file of the card opens on that file', 'footer review goes to the same view', 'open file goes to Files'] })
}, { width: 1500, height: 900 })

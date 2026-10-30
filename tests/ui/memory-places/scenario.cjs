// Memoria por lugares (plan 0.4.0 #75) con el Engine real:
// 1. Las pestañas por lugar dicen cuántos recuerdos hay en cada uno; cada fila
//    lleva su lugar como chip (salvo General).
// 2. Marcar filas saca la barra de selección flotando: ninguna fila se mueve.
// 3. «Mover a…» → General lleva los marcados y la barra se va.
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { join } = require('node:path')
const { click, clickText, command, evaluate, menuShortcut, report, scenario, screenshot, settleAnimations, ui, until, useLocalModel, wait } = require('../harness.cjs')

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const record = (fields) => ({ scope: 'user', kind: 'preference', provenance: 'panel', confidence: 1, created_at: '2026-09-01T10:00:00Z', updated_at: '2026-10-02T10:00:00Z', ...fields })
const ROWS = '[data-testid="memory-record"]'
const rowTops = () => evaluate(`[...document.querySelectorAll('${ROWS}')].map((row) => Math.round(row.getBoundingClientRect().top))`)
const tabCount = (label) => evaluate(`[...document.querySelectorAll('[data-testid="memory-places"] [role="tab"]')].find((tab) => tab.textContent.includes(${JSON.stringify(label)}))?.querySelector('.seg-tab-count')?.textContent`)

scenario(async () => {
  await useLocalModel()
  const repo = join(ui.data, 'workspace', 'tienda')
  const bundle = {
    format: 'rinari-memory',
    version: 1,
    exported_at: '2026-10-01T09:00:00Z',
    records: [
      record({ topic: 'idioma', text: 'Responde en español' }),
      record({ topic: 'estilo', text: 'Respuestas cortas, con pasos numerados' }),
      record({ topic: 'saturno', kind: 'environment', text: 'Saturno está en 10.0.0.7' }),
      record({ scope: 'project', kind: 'workflow', topic: 'arranque', text: 'Arranca con npm run dev', project_root: repo }),
      record({ scope: 'project', kind: 'workflow', topic: 'pruebas', text: 'Las pruebas van con vitest', project_root: repo }),
    ],
    suppressions: [],
  }
  await command('memory_import', { bundle, digest: sha256(canonical(bundle)), dry_run: false })
  await menuShortcut('settings', 'CmdOrCtrl+,')
  await clickText('Memoria', 'nav button')
  await wait(`document.querySelectorAll('${ROWS}').length === 5`)

  // 1. Counts per place and the place chip on project rows.
  assert.equal(await tabCount('Todo'), '5')
  assert.equal(await tabCount('Proyecto'), '2')
  assert.equal(await evaluate(`document.querySelectorAll('${ROWS} .memory-place-chip[data-place="project"]').length`), 2, 'project rows carry their chip')
  await evaluate(`document.querySelector('[data-testid="memory-places"]').scrollIntoView({ block: 'start' })`)
  await settleAnimations()
  await screenshot('01-places')

  // 2. Checking rows brings the floating bar without moving any row.
  const before = await rowTops()
  await evaluate(`document.querySelectorAll('${ROWS} input[type="checkbox"]')[3].click()`)
  await evaluate(`document.querySelectorAll('${ROWS} input[type="checkbox"]')[4].click()`)
  await wait(`Boolean(document.querySelector('[data-testid="memory-bulk"]'))`)
  await settleAnimations()
  assert.deepEqual(await rowTops(), before, 'the bar floats over the list')
  assert.ok(await evaluate(`document.querySelector('[data-testid="memory-bulk"]').innerText.includes('2 seleccionados')`))
  await screenshot('02-selected')

  // 3. «Mover a…» → General.
  await click('[data-testid="memory-move"]')
  await clickText('General (en todas partes)', '[role="menuitem"]', { includes: true })
  await until(async () => (await command('memory_list', { scope: 'all' })).records.filter((item) => (item.place ?? item.scope) === 'project').length === 0, 'both moved to general')
  await wait(`!document.querySelector('[data-testid="memory-bulk"]')`)
  await wait(`document.querySelector('[data-testid="memory-places"] [role="tab"]:nth-child(4) .seg-tab-count')?.textContent === '0'`)
  await settleAnimations()
  await screenshot('03-moved')
  report({ realEngine: true, passed: ['counts per place and place chips', 'floating selection bar moves no row', 'move to general'] })
}, { width: 1300, height: 900 })

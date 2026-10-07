// Un XLSX del workspace se abre en el visor documental: «Contenido» es una
// cuadrícula con las hojas del libro. Las fórmulas sin resultado calculado se
// ven pendientes (nunca un 0 inventado), el texto que empieza por «=» sigue
// siendo texto y el botón «Fórmulas» enseña la fórmula de cada celda.
const assert = require('node:assert/strict')
const { copyFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')
const { ui, click, clickText, command, evaluate, input, reload, report, scenario, screenshot, useLocalModel, wait } = require('../harness.cjs')

scenario(async () => {
  await useLocalModel()
  const root = join(ui.data, 'Finanzas')
  mkdirSync(join(root, 'out'), { recursive: true })
  copyFileSync(join(__dirname, 'presupuesto.xlsx'), join(root, 'out', 'presupuesto.xlsx'))
  const { project } = await command('project_add', { path: root, name: 'Finanzas' })
  await command('session_create', { project_id: project.id, title: 'Presupuesto' })
  await reload()
  await clickText('Presupuesto', 'aside button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  await input('.composer-surface textarea', 'Revisa el presupuesto')
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await wait(`Boolean(document.querySelector('a[data-file-path="out/presupuesto.xlsx"]'))`)
  await click('a[data-file-path="out/presupuesto.xlsx"]')

  await wait(`Boolean(document.querySelector('[data-document-kind="xlsx"]'))`, 30_000)
  await clickText('Contenido', '[data-document-kind="xlsx"] [role="tab"]')
  await wait(`Boolean(document.querySelector('[data-testid="sheet-grid"] [data-cell="A4"]'))`, 60_000)
  const cell = (address) => evaluate(`document.querySelector('[data-testid="sheet-grid"] [data-cell="${address}"]')?.textContent ?? null`)
  assert.equal(await cell('A4'), 'Crecimiento')
  assert.equal(await cell('B5'), '…', 'a formula without a calculated result is pending, never 0')
  assert.match(await evaluate(`document.querySelector('[data-testid="sheet-grid"]').innerText`), /sin resultado calculado/)
  await clickText('Fórmulas', '[data-testid="sheet-grid"] button')
  assert.equal(await cell('B5'), '=SUM(Ventas[Ventas])')
  await screenshot('formulas')

  await clickText('Ventas', '[data-testid="sheet-grid"] [role="tab"]')
  await wait(`document.querySelector('[data-testid="sheet-grid"] [data-cell="A3"]')?.textContent === '=HYPERLINK("x")'`)
  assert.equal(await cell('B2'), '000123', 'identifiers keep their leading zeros')
  await screenshot('sheet-ventas')
  report({ passed: ['xlsx opens as a sheet grid', 'uncalculated formulas shown pending', 'formula view', 'text starting with = stays text', 'ids keep zeros', 'sheet tabs'] })
}, { width: 1500, height: 900 })

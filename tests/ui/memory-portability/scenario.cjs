// Memoria portátil: Ajustes > Memoria importa un archivo de otra instalación
// (resumen y confirmación), lo exportado vuelve a tener lo mismo con su
// digest, reimportarlo no añade nada y un archivo cambiado se rechaza.
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { dialog } = require('electron')
const { mkdtempSync, readFileSync, writeFileSync, existsSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const { clickText, command, menuShortcut, report, scenario, screenshot, until, useLocalModel, wait } = require('../harness.cjs')

const folder = mkdtempSync(join(tmpdir(), 'rinari-memory-portability-'))
const text = (value) => `document.body.innerText.includes(${JSON.stringify(value)})`

// El digest del Engine: SHA-256 del JSON canónico (claves ordenadas, sin
// espacios, texto sin escapar). Con texto y enteros, JSON.stringify coincide.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const normalized = (value) => value.trim().toLowerCase().split(/\s+/).join(' ')

const record = (fields) => ({
  scope: 'user',
  kind: 'preference',
  provenance: 'panel',
  confidence: 1,
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-02T10:00:00Z',
  ...fields,
})
const FORGOTTEN = 'Prefiere café sin azúcar'
const bundle = {
  format: 'rinari-memory',
  version: 1,
  exported_at: '2026-10-01T09:00:00Z',
  records: [
    record({ topic: 'idioma', text: 'Responde en español' }),
    record({ topic: 'saturno', kind: 'environment', text: 'Saturno está en 10.0.0.7', provenance: 'learned:session/otra-instalacion' }),
    record({ scope: 'project', kind: 'workflow', topic: 'arranque', text: 'Arranca con make dev', project_root: join(folder, 'repo') }),
    record({ topic: 'bebidas', text: FORGOTTEN }),
  ],
  suppressions: [{ topic_hash: sha256('bebidas'), text_hash: sha256(normalized(FORGOTTEN)), created_at: '2026-09-03T10:00:00Z' }],
}
const original = join(folder, 'memoria-otra-instalacion.json')
writeFileSync(original, JSON.stringify({ bundle, digest: sha256(canonical(bundle)) }, null, 2))
const tampered = join(folder, 'memoria-cambiada.json')
writeFileSync(tampered, JSON.stringify({ bundle: { ...bundle, records: bundle.records.map((item, i) => (i === 0 ? { ...item, text: 'Responde en inglés' } : item)) }, digest: sha256(canonical(bundle)) }))
const exported = join(folder, 'exportada.json')

let nextOpen = original
const openRequests = []
const saveRequests = []
dialog.showOpenDialog = async (...args) => {
  openRequests.push(args.at(-1))
  return { canceled: false, filePaths: [nextOpen] }
}
dialog.showSaveDialog = async (...args) => {
  saveRequests.push(args.at(-1))
  return { canceled: false, filePath: exported }
}

async function texts() {
  return (await command('memory_list', { scope: 'all' })).records.map((item) => item.text).sort()
}

scenario(async () => {
  await useLocalModel()
  await menuShortcut('settings', 'CmdOrCtrl+,')
  await clickText('Memoria', 'nav button')
  await wait(text('Exportar e importar'))

  // 1. Importar: resumen antes de escribir nada, y confirmación.
  await clickText('Importar…')
  await wait(`Boolean(document.querySelector('[role="alertdialog"] [data-testid="memory-import-summary"]'))`)
  await wait(text('Recuerdos nuevos: 3'))
  await wait(text('Olvidados antes, no se restauran: 1'))
  assert.deepEqual(await texts(), [], 'the preview writes nothing')
  assert.deepEqual(openRequests[0].filters, [{ name: 'JSON', extensions: ['json'] }])
  await screenshot('import-preview')
  await clickText('Importar', '[role="alertdialog"] button')
  await until(async () => (await texts()).length === 3, 'three records imported')
  assert.deepEqual(await texts(), ['Arranca con make dev', 'Responde en español', 'Saturno está en 10.0.0.7'])
  await wait(`[...document.querySelectorAll('[data-testid="memory-record"]')].some(el => el.textContent.includes('Saturno está en 10.0.0.7'))`)
  await wait(text('Recuerdos importados: 3.'))
  await screenshot('imported')

  // 2. Exportar: lo que se guarda vuelve a ser un paquete válido.
  await clickText('Exportar…')
  await until(() => existsSync(exported), 'export written to the chosen path')
  assert.match(saveRequests[0].defaultPath, /rinari-memory-\d{4}-\d{2}-\d{2}\.json$/)
  const file = JSON.parse(readFileSync(exported, 'utf8'))
  assert.equal(file.digest, sha256(canonical(file.bundle)))
  assert.deepEqual(file.bundle.records.map((item) => item.text).sort(), ['Arranca con make dev', 'Responde en español', 'Saturno está en 10.0.0.7'])
  assert.equal(file.bundle.records.find((item) => item.topic === 'saturno').provenance, 'learned:session/otra-instalacion')
  assert.equal(file.bundle.suppressions.length, 1)
  assert(!JSON.stringify(file).includes(FORGOTTEN), 'forgotten text never travels')
  await wait(text('Memoria exportada a exportada.json.'))

  // 3. Reimportar lo exportado no añade nada.
  nextOpen = exported
  await clickText('Importar…')
  await wait(text('Nada nuevo que importar de exportada.json.'))
  assert.equal((await texts()).length, 3)

  // 4. Un archivo cambiado después de exportarlo se rechaza entero.
  nextOpen = tampered
  await clickText('Importar…')
  await wait(text('El archivo cambió después de exportarlo o está dañado. No se importó nada.'))
  assert.equal((await texts()).length, 3)
  await screenshot('tampered')
  report({ realEngine: true, passed: ['preview then confirm', 'forgotten stays forgotten', 'export round-trips with its digest', 'reimport adds nothing', 'tampered file refused'] })
}, { width: 1300, height: 900 })

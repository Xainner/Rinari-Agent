// Entregas de Rinari (plan 0.4.0 #35 y la tabla del 35b) con el Engine real:
// el modelo falso entrega con `file.present` una imagen, un CSV, un Markdown,
// un PDF, un audio, una carpeta y una página web. La tarjeta pinta cada uno por
// lo que es (miniatura, primeras filas, primeras líneas, primera página o su
// icono, reproductor, contenido de la carpeta, la página), el audio suena ahí
// mismo y pulsar el CSV lo abre en «Archivos» del panel lateral.
const assert = require('node:assert/strict')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const zlib = require('node:zlib')
const { ui, click, clickText, command, evaluate, input, reload, report, scenario, screenshot, settleAnimations, useLocalModel, wait } = require('../harness.cjs')

const CARD = '[data-testid="presented-files"]'

function crc32(buffer) {
  let crc = ~0
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return ~crc >>> 0
}

/** A small violet gradient PNG, written by hand so the scenario needs no assets. */
function png(width, height) {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4)
  header[8] = 8; header[9] = 2
  const rows = []
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3)
    for (let x = 0; x < width; x += 1) {
      row[1 + x * 3] = 80 + Math.round((x / width) * 120)
      row[2 + x * 3] = 40 + Math.round((y / height) * 60)
      row[3 + x * 3] = 200
    }
    rows.push(row)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Half a second of a 440 Hz tone, 8-bit mono WAV. */
function wav() {
  const rate = 8000
  const samples = Buffer.alloc(rate / 2)
  for (let index = 0; index < samples.length; index += 1) samples[index] = 128 + Math.round(60 * Math.sin((2 * Math.PI * 440 * index) / rate))
  const header = Buffer.alloc(44)
  header.write('RIFF', 0); header.writeUInt32LE(36 + samples.length, 4); header.write('WAVE', 8)
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22)
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate, 28); header.writeUInt16LE(1, 32); header.writeUInt16LE(8, 34)
  header.write('data', 36); header.writeUInt32LE(samples.length, 40)
  return Buffer.concat([header, samples])
}

/** A one-page PDF with a title; whether it renders depends on the PDF backend. */
function pdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  const stream = 'BT /F1 24 Tf 40 340 Td (Informe) Tj ET'
  objects[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  let out = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((body, index) => { offsets.push(out.length); out += `${index + 1} 0 obj\n${body}\nendobj\n` })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

scenario(async () => {
  await useLocalModel()
  const root = join(ui.data, 'Entregas')
  mkdirSync(join(root, 'out', 'sitio', 'assets'), { recursive: true })
  writeFileSync(join(root, 'out', 'portada.png'), png(320, 200))
  writeFileSync(join(root, 'out', 'ventas.csv'), 'mes,unidades,total\nenero,12,"1,200"\nfebrero,9,900\nmarzo,15,1500\n')
  writeFileSync(join(root, 'out', 'notas.md'), '# Notas de la entrega\n\n- Portada en violeta\n- Ventas del trimestre\n')
  writeFileSync(join(root, 'out', 'informe.pdf'), pdf())
  writeFileSync(join(root, 'out', 'tono.wav'), wav())
  writeFileSync(join(root, 'out', 'sitio', 'index.html'), '<h1>Hola</h1>')
  writeFileSync(join(root, 'out', 'sitio', 'assets', 'app.js'), 'console.log(1)')
  const { project } = await command('project_add', { path: root, name: 'Entregas' })
  await command('session_create', { project_id: project.id, title: 'Entrega del trimestre', permission_profile: 'full-access' })
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Entrega del trimestre', 'aside li button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  await input('.composer-surface textarea', 'Entrégame lo del trimestre')
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await wait(`document.body.innerText.includes('ENTREGADO')`)
  await wait(`document.querySelectorAll('${CARD} .present-tile').length === 7`)

  // Each delivery, by what it is.
  const kinds = await evaluate(`[...document.querySelectorAll('${CARD} .present-tile')].map(t => t.dataset.presentKind)`)
  assert.deepEqual(kinds, ['image', 'sheet', 'markdown', 'pdf', 'audio', 'folder', 'web'])
  await wait(`document.querySelector('${CARD} [data-thumb="image"]')?.dataset.state === 'ready'`)
  await wait(`document.querySelectorAll('${CARD} .present-sheet th').length === 3`)
  const sheet = await evaluate(`[...document.querySelectorAll('${CARD} .present-sheet tr')].map(r => [...r.children].map(c => c.textContent))`)
  assert.deepEqual(sheet[1], ['enero', '12', '1,200'], 'quoted cells keep their comma')
  await wait(`document.querySelector('${CARD} .present-text')?.textContent.startsWith('# Notas de la entrega')`)
  const entries = await evaluate(`[...document.querySelectorAll('${CARD} .present-entries li')].map(li => li.textContent)`)
  assert.ok(entries.includes('assets') && entries.includes('index.html'), JSON.stringify(entries))
  assert.match(await evaluate(`document.querySelector('${CARD} [data-present-kind="web"]').innerText`), /example\.com/)
  // The PDF shows its first page when there is a renderer, or its icon; never a spinner forever.
  await wait(`['ready', 'empty'].includes(document.querySelector('${CARD} [data-present-kind="pdf"] .present-thumb')?.dataset.state)`, 60_000)
  await settleAnimations()
  await screenshot('card')

  // The audio plays in the card.
  await evaluate(`document.querySelector('${CARD} [data-present-kind="audio"] .present-play').scrollIntoView({ block: 'center' })`)
  await settleAnimations()
  await click(`${CARD} [data-present-kind="audio"] .present-play`)
  await wait(`Boolean(document.querySelector('${CARD} [data-present-kind="audio"] audio'))`)

  // The CSV opens in «Archivos».
  await evaluate(`document.querySelector('${CARD} [data-present-kind="sheet"] .present-thumb').scrollIntoView({ block: 'center' })`)
  await settleAnimations()
  await click(`${CARD} [data-present-kind="sheet"] .present-thumb`)
  await wait(`document.querySelector('[data-testid="session-dock"]')?.innerText.includes('ventas.csv')`)
  await settleAnimations()
  await screenshot('opened')
  report({ passed: ['each delivery by kind: thumbnail, rows, lines, page or icon, player, entries, page', 'audio plays in the card', 'CSV opens in Archivos'] })
}, { width: 1500, height: 960 })

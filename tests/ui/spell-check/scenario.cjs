// Corrector del composer (#72): una palabra mal escrita, clic derecho, y el
// menú nativo trae sugerencias y «Agregar al diccionario»; elegir una
// sugerencia reemplaza la palabra en el texto.
const assert = require('node:assert/strict')
const { Menu } = require('electron')

// Se captura el menú nativo sin mostrarlo: el popup real bloquearía la prueba.
const shown = []
Menu.prototype.popup = function () { shown.push(this) }

const { click, clickAt, center, delay, evaluate, report, scenario, screenshot, until, wait } = require('../harness.cjs')

const BOX = '.composer-surface textarea'

scenario(async (ui) => {
  await click('.view-switcher button[aria-label="Normal"]')
  await wait(`Boolean(document.querySelector('${BOX}'))`)
  await click(BOX)
  ui.win.webContents.insertText('Hola aora ')
  await delay(500)
  // El corrector marca la palabra cuando le toca; se reintenta el clic derecho.
  const word = await evaluate(`(() => {const t=document.querySelector('${BOX}');const r=t.getBoundingClientRect();return {x:Math.round(r.x+12+5*8.5),y:Math.round(r.y+r.height/2)}})()`)
  let menu
  await until(async () => {
    shown.length = 0
    const box = await center(BOX)
    await clickAt(word.x, box.y, 'right')
    await delay(300)
    menu = shown.at(-1)
    return Boolean(menu && menu.items.some((item) => item.label === 'Agregar al diccionario'))
  }, 'el menú del corrector', 20_000)
  const labels = menu.items.map((item) => item.type === 'separator' ? '—' : item.label)
  const add = labels.indexOf('Agregar al diccionario')
  assert.ok(add >= 1 && add <= 5, `sugerencias arriba: ${labels.join(' | ')}`)
  assert.deepEqual(labels.slice(add + 1, add + 3), ['—', 'Deshacer'])
  const suggestion = menu.items[0].label
  menu.items[0].click()
  await until(async () => (await evaluate(`document.querySelector('${BOX}').value`)).includes(suggestion), 'la sugerencia reemplaza la palabra')
  const value = await evaluate(`document.querySelector('${BOX}').value`)
  assert.ok(!/\baora\b/.test(value), value)
  await screenshot('replaced')

  // Fuera de un campo editable sigue el menú propio de la app.
  shown.length = 0
  const header = await center('.view-switcher')
  await clickAt(header.x, header.y + 40, 'right')
  await delay(300)
  assert.ok(!shown.some((m) => m.items.some((item) => item.label === 'Agregar al diccionario')))
  report({ labels, suggestion, value })
})

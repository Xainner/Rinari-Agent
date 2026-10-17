// El árbol de la vista Archivos (plan 0.4.0 #98) con el Engine real:
// 1. «Archivos del proyecto» lista el proyecto; una carpeta que solo contiene
//    otra se abre con ella en una fila («docs/guia»).
// 2. Un archivo arrastrado del árbol al composer entra como «@archivo»
//    (adjunto del espacio de trabajo y la mención en el texto).
const assert = require('node:assert/strict')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { click, clickText, command, delay, evaluate, input, reload, report, scenario, screenshot, settleAnimations, toggleDockView, ui, useLocalModel, wait } = require('../harness.cjs')

const TREE = '[data-testid="file-tree"]'
const row = (path) => `${TREE} [data-path=${JSON.stringify(path)}]`

scenario(async () => {
  await useLocalModel()
  const root = join(ui.data, 'workspace', 'tienda')
  for (const dir of ['src/caja', 'docs/guia']) mkdirSync(join(root, dir), { recursive: true })
  for (const file of ['src/caja/ticket.ts', 'src/main.ts', 'docs/guia/intro.md', 'README.md', 'package.json']) writeFileSync(join(root, file), `// ${file}\n`)
  const added = await command('project_add', { path: root, name: 'Tienda' })
  await command('session_create', { project_id: added.project?.id ?? added.id, title: 'Árbol' })
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Árbol', 'aside button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  await input('.composer-surface textarea', 'Hola')
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await wait(`document.body.innerText.includes('HOLA')`)
  await toggleDockView('files')
  await wait(`Boolean(document.querySelector(${JSON.stringify(row('docs'))}))`)

  // 1. A folder holding only another opens with it: one row «docs/guia».
  await click(row('docs'))
  await wait(`document.querySelector(${JSON.stringify(row('docs/guia'))})?.textContent.includes('docs/guia')`)
  await wait(`Boolean(document.querySelector(${JSON.stringify(row('docs/guia/intro.md'))}))`)
  await settleAnimations()
  await screenshot('tree')

  // 2. Drag README.md onto the composer: it comes in as «@README.md».
  await evaluate(`(() => {
    const data = new DataTransfer()
    document.querySelector(${JSON.stringify(row('README.md'))}).dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: data }))
    const surface = document.querySelector('.composer-surface')
    surface.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data }))
    surface.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }))
  })()`)
  await wait(`document.querySelector('.composer-surface textarea').value.includes('@README.md')`)
  assert.ok(await evaluate(`document.querySelector('.composer-surface').innerText.includes('README.md')`), 'the file is attached')
  await delay(200)
  await screenshot('dropped')
  report({ passed: ['project tree with a compact folder', 'drag a file into the composer as @file'] })
}, { width: 1400, height: 900 })

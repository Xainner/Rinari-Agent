// Un PPTX del workspace se abre en el visor documental, no como texto: sus
// diapositivas renderizadas por el Engine (Office local o LibreOffice) con su
// lista de miniaturas y, si el equipo no tiene ninguno, un aviso que lo dice y
// ofrece abrirlo con su aplicación. La pestaña «Contenido» muestra lo que el
// Engine leyó: texto, datos del gráfico y notas. «Verificación» valida bajo
// demanda y nunca da por revisado lo visual; «Revisiones» lista el original.
const assert = require('node:assert/strict')
const { copyFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')
const { ui, click, clickText, command, evaluate, input, reload, report, scenario, screenshot, useLocalModel, wait } = require('../harness.cjs')

scenario(async () => {
  await useLocalModel()
  const root = join(ui.data, 'Ventas')
  mkdirSync(join(root, 'out'), { recursive: true })
  copyFileSync(join(__dirname, 'ventas.pptx'), join(root, 'out', 'ventas.pptx'))
  const { project } = await command('project_add', { path: root, name: 'Ventas' })
  await command('session_create', { project_id: project.id, title: 'Presentación' })
  await reload()
  await clickText('Presentación', 'aside button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  await input('.composer-surface textarea', 'Revisa la presentación')
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await wait(`Boolean(document.querySelector('a[data-file-path="out/ventas.pptx"]'))`)
  await click('a[data-file-path="out/ventas.pptx"]')

  await wait(`Boolean(document.querySelector('[data-document-kind="pptx"]'))`)
  await wait(`document.querySelector('[data-document-kind="pptx"]').innerText.includes('3 diapositivas')`, 30_000)
  // O las miniaturas (hay renderer) o el aviso explícito (no lo hay).
  await wait(`document.querySelectorAll('[data-document-kind="pptx"] button[aria-label^="Diapositiva "]').length === 3
    || document.body.innerText.includes('hace falta Microsoft Office o LibreOffice')`, 240_000)
  const rendered = await evaluate(`document.querySelectorAll('[data-document-kind="pptx"] button[aria-label^="Diapositiva "]').length === 3`)
  const text = await evaluate(`document.querySelector('[data-document-kind="pptx"]').innerText`)
  assert.doesNotMatch(text, /PK\u0003\u0004|\[Content_Types\]/, 'never the zip bytes as text')
  if (rendered) {
    await click('[data-document-kind="pptx"] button[aria-label="Diapositiva 2"]')
    await wait(`Boolean(document.querySelector('[data-document-kind="pptx"] img[alt="Diapositiva 2 de ventas.pptx"]')?.naturalWidth)`)
    await screenshot('slides')
  } else {
    assert(await evaluate(`Boolean(document.querySelector('[data-document-kind="pptx"] button[aria-label="Abrir externamente"]'))`))
    await screenshot('no-renderer')
  }

  await clickText('Contenido', '[data-document-kind="pptx"] [role="tab"]')
  await wait(`document.querySelector('[data-document-kind="pptx"]').innerText.includes('Nota 1')`)
  const content = await evaluate(`document.querySelector('[data-document-kind="pptx"]').innerText`)
  assert.match(content, /Diapositiva 1: crecimiento del año ñandú/)
  assert.match(content, /Gráfico COLUMN_CLUSTERED: 2026 \(2\)/)
  await screenshot('content')

  await clickText('Verificación', '[data-document-kind="pptx"] [role="tab"]')
  await clickText('Validar', '[data-document-kind="pptx"] button')
  await wait(`Boolean(document.querySelector('[data-testid="document-checks"] [data-check="structure"]'))`, 60_000)
  const checks = await evaluate(`Object.fromEntries([...document.querySelectorAll('[data-testid="document-checks"] [data-check]')].map((row) => [row.dataset.check, row.dataset.status]))`)
  assert.equal(checks.structure, 'passed')
  assert.notEqual(checks.visual, 'passed', 'nobody reviewed the pages, so visual is not passed')
  await screenshot('checks')

  await clickText('Revisiones', '[data-document-kind="pptx"] [role="tab"]')
  await wait(`Boolean(document.querySelector('[data-document-kind="pptx"] ol[aria-label="Revisiones"] button[aria-current="true"]'))`)
  assert.match(await evaluate(`document.querySelector('[data-document-kind="pptx"] ol[aria-label="Revisiones"]').innerText`), /Original/)
  report({ passed: [rendered ? 'slides rendered by the installed Office/LibreOffice' : 'no renderer: explicit notice and open externally', 'content tab shows text, chart data and notes', 'never binary as text', 'checks validated on request, visual not claimed', 'revisions list the original'], rendered, checks })
}, { width: 1500, height: 900 })

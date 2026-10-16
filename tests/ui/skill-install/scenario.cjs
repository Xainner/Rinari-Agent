// Instalar varias skills a la vez con el Engine real (plan 0.4.0 #53):
// 1. Ajustes › Skills › «Instalar skill» revisa una carpeta con tres skills.
// 2. «Seleccionar todas» queda a medias (raya) si se quita una, y completa.
// 3. «Instalar seleccionadas (3)» instala las limpias y deja la que descarga
//    y ejecuta código en «Pide confirmar» con sus avisos; cada fila lleva su
//    chip y el check de «Instalada» se dibuja porque se la vio instalándose.
// 4. La barra de la lista no cambia de alto mientras aparece el progreso, y
//    «Instalar de todos modos» termina la tercera sin cerrar el diálogo.
const assert = require('node:assert/strict')
const { join } = require('node:path')
const { click, clickText, command, evaluate, input, menuShortcut, report, scenario, screenshot, settleAnimations, ui, until, wait } = require('../harness.cjs')

const ROWS = '[data-testid="skill-candidate"]'
const rowState = (name) => `[...document.querySelectorAll('${ROWS}')].find(r => r.querySelector('.skill-row-name')?.textContent === ${JSON.stringify(name)})?.dataset.state`

scenario(async () => {
  await menuShortcut('settings', 'CmdOrCtrl+,')
  await clickText('Skills', 'nav button')
  await clickText('Instalar skill', 'button', { includes: true })
  await wait(`Boolean(document.querySelector('.install-skill-dialog'))`)

  // 1. Review the folder.
  await input('.install-skill-dialog input[aria-label="Origen de la skill"]', join(ui.data, 'skills-src'))
  await clickText('Revisar', '.install-skill-dialog button')
  await wait(`document.querySelectorAll('${ROWS}').length === 3`)
  await settleAnimations()
  const hidden = await evaluate(`[...document.querySelectorAll('${ROWS}')].filter(r => getComputedStyle(r).opacity !== '1').length`)
  assert.equal(hidden, 0, 'every row ends visible')
  await screenshot('reviewed')

  // 2. Select all, then one less: the header box shows a dash.
  await click('.install-skill-all input')
  await wait(`document.querySelector('.install-skill-all input').checked`)
  await click(`${ROWS} input[aria-label="Elegir notas-pdf"]`)
  await wait(`document.querySelector('.install-skill-all input').indeterminate`)
  await screenshot('partial-selection')
  await click('.install-skill-all input')
  await wait(`[...document.querySelectorAll('${ROWS} input')].every(i => i.checked)`)

  // 3. Install all three; watch the states and the bar height as they happen.
  await evaluate(`(() => {
    const bar = document.querySelector('.install-skill-bar')
    window.__install = { states: new Set(), heights: new Set([bar.offsetHeight]), progress: false }
    new MutationObserver(() => {
      document.querySelectorAll('.skill-status').forEach(chip => window.__install.states.add(chip.dataset.state))
      if (document.querySelector('.install-skill-progress')) window.__install.progress = true
      window.__install.heights.add(bar.offsetHeight)
    }).observe(document.querySelector('.install-skill-dialog'), { subtree: true, childList: true, attributes: true, characterData: true })
  })()`)
  await clickText('Instalar seleccionadas (3)', '.install-skill-dialog button')
  await wait(`${rowState('notas-pdf')} === 'installed' && ${rowState('notas-release')} === 'installed' && ${rowState('instalador-raro')} === 'confirm'`)
  await settleAnimations()
  const seen = await evaluate(`({ states: [...window.__install.states], heights: [...window.__install.heights], progress: window.__install.progress })`)
  assert.ok(seen.states.includes('installing'), `rows showed «Instalando» (${seen.states})`)
  assert.ok(seen.progress, 'the progress line appeared')
  assert.equal(seen.heights.length, 1, `the list bar kept its height (${seen.heights})`)
  const drawn = await evaluate(`document.querySelectorAll('.skill-status[data-state="installed"] svg.r-check').length`)
  assert.equal(drawn, 2, 'the check draws on rows seen installing')
  await wait(`[...document.querySelectorAll('.skill-status[data-state="confirm"]')].some(c => c.textContent.includes('Pide confirmar'))`)
  await wait(`[...document.querySelectorAll('.install-skill-dialog button')].some(b => b.textContent.includes('Instalar de todos modos'))`)
  const overflow = await evaluate(`(() => { const list = document.querySelector('.install-skill-rows'); return list.scrollWidth - list.clientWidth })()`)
  assert.ok(overflow <= 1, `no sideways scroll in the list (${overflow}px)`)
  await screenshot('installed-and-confirm')

  // 4. Confirm the risky one; the dialog stays open with every row done.
  await clickText('Instalar de todos modos', '.install-skill-dialog button', { includes: true })
  await wait(`${rowState('instalador-raro')} === 'installed'`)
  await until(async () => {
    const names = (await command('skill_list', {})).skills.map((s) => s.name)
    return ['notas-pdf', 'notas-release', 'instalador-raro'].every((name) => names.includes(name))
  }, 'the three skills are installed')
  assert.ok(await evaluate(`Boolean(document.querySelector('.install-skill-dialog'))`), 'dialog stays open')
  await settleAnimations()
  await screenshot('all-installed')
  report({ passed: ['review a folder with three skills', 'partial select-all shows a dash', 'clean skills install, risky one asks', 'check draws on rows seen installing', 'list bar keeps its height', 'confirm installs without closing'] })
}, { width: 1280, height: 860 })

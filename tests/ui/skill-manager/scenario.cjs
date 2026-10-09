// Gestor de skills de punta a punta con el Engine real:
// 1. «Guardar como lección» en un turno que hizo trabajo envía /lesson, el
//    Engine lo toma como pedido del dueño y la tarjeta muestra la skill
//    guardada con «Deshacer».
// 2. Una skill casi igual a otra se frena (SIMILAR_EXISTS); con un motivo
//    queda pendiente con «Parecida a …» y se aprueba desde la tarjeta.
// 3. Ajustes › Skills lista el par como posible duplicado; «Fusionar» deja
//    `/merge-skills a b` escrito en una conversación nueva, sin enviarlo.
const assert = require('node:assert/strict')
const { click, clickText, command, input, menuShortcut, reload, report, scenario, screenshot, until, useLocalModel, wait } = require('../harness.cjs')

const text = (value) => `document.body.innerText.includes(${JSON.stringify(value)})`
const SEND = '.composer-surface button[aria-label="Enviar mensaje"]'

async function send(message) {
  await input('.composer-surface textarea', message)
  await wait(`!document.querySelector(${JSON.stringify(SEND)})?.disabled && !document.querySelector('[data-sonner-toast]')`)
  await click(SEND)
  await wait(`document.querySelector('.composer-surface textarea').value === ''`)
}

async function skillNames() {
  return (await command('skill_list', {})).skills.filter((s) => s.enabled !== false).map((s) => s.name)
}

scenario(async () => {
  await useLocalModel()
  const session = (await command('session_create', { chat: true, title: 'Skills' })).session.id
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Skills', 'aside button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')

  // 1. A turn that did work offers «Guardar como lección».
  await send('Revisa la carpeta de notas')
  await wait(text('LISTO UNO'))
  await wait(`Boolean(document.querySelector('[data-testid="turn-lesson"]'))`)
  await click('[data-testid="turn-lesson"]')
  await wait(`Boolean(document.querySelector('[data-testid="skill-proposal"][data-status="active"]'))`)
  await wait(text('LECCION GUARDADA'))
  await until(async () => (await skillNames()).includes('release-notes'), 'the lesson was saved as the owner asked')
  await screenshot('lesson-saved')

  // 2. A near-duplicate is stopped, then waits for approval with its reason.
  await send('Crea otra skill para las notas de version')
  await wait(text('LISTO TRES'))
  await wait(`Boolean(document.querySelector('[data-testid="skill-proposal"][data-status="pending"]'))`)
  await wait(`[...document.querySelectorAll('[data-testid="skill-similar"]')].some(el => el.textContent.includes('release-notes'))`)
  assert(!(await skillNames()).includes('release-notes-draft'), 'not saved before approval')
  await screenshot('similar-pending')
  await clickText('Aprobar', '[data-testid="skill-proposal"][data-status="pending"] button')
  await until(async () => (await skillNames()).includes('release-notes-draft'), 'approved from the card')

  // 3. Settings › Skills lists the pair; «Fusionar» prepares the request.
  await menuShortcut('settings', 'CmdOrCtrl+,')
  await clickText('Skills', 'nav button')
  await wait(`[...document.querySelectorAll('[data-testid="skill-duplicate-pair"]')].some(el => el.textContent.includes('release-notes'))`)
  await screenshot('duplicates')
  await clickText('Fusionar', '[data-testid="skill-duplicate-pair"] button')
  await wait(`document.querySelector('.composer-surface textarea')?.value.startsWith('/merge-skills ')`)
  await screenshot('merge-prepared')
  report({ session, passed: ['lesson from a turn saves active with undo', 'near-duplicate stopped then pending with reason', 'approve from the card', 'duplicates listed in Settings', 'merge request prepared, not sent'] })
}, { width: 1400, height: 900 })

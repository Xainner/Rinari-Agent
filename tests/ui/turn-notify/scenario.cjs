// #33: un plan que termina en otra conversación de Normal (no en Boards)
// avisa con su propio texto y «Revisar plan»; la barra lateral marca esa
// conversación y la campana la nombra. «Revisar plan» lleva a la tarjeta.
const assert = require('node:assert/strict')
const { ui, clickText, click, command, evaluate, input, reload, report, scenario, screenshot, until, useLocalModel, wait } = require('../harness.cjs')

const origin = () => ui.model.replace(/\/v1$/, '')
const TOAST = '[data-sonner-toast]'

scenario(async () => {
  await useLocalModel()
  await command('session_create', { chat: true, title: 'Plan de la API', mode: 'plan' })
  await command('session_create', { chat: true, title: 'Otra conversación' })
  await reload()
  await clickText('Plan de la API', 'aside button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  await input('.composer-surface textarea', 'Planea la migración de la API')
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await until(async () => (await (await fetch(origin() + '/__pending')).json()) === true, 'the plan turn reaches the held model request')

  await clickText('Otra conversación', 'aside button', { includes: true })
  await fetch(origin() + '/__release')

  // El aviso dice qué conversación y que es un plan, con «Revisar plan».
  await wait(`[...document.querySelectorAll('${TOAST}')].some((toast) => toast.innerText.includes('El plan de «Plan de la API» está listo para revisar.'))`)
  const toastText = await evaluate(`[...document.querySelectorAll('${TOAST}')].map((toast) => toast.innerText).join(' | ')`)
  assert.ok(toastText.includes('Revisar plan'), 'the plan notice offers «Revisar plan»')

  // La barra lateral marca esa conversación (no solo las de Boards).
  const signal = await evaluate(`(() => {
    const row = [...document.querySelectorAll('aside button')].find((button) => button.innerText.includes('Plan de la API'))
    return row?.querySelector('[data-testid="sidebar-signal"]')?.getAttribute('data-signal') ?? null
  })()`)
  assert.equal(signal, 'unread', 'the sidebar marks the conversation with an unread result')

  // La campana la nombra en «Conversaciones».
  await click('[data-testid="notification-center-trigger"]')
  await wait(`Boolean(document.querySelector('[data-testid="notify-conversations"]'))`)
  const bell = await evaluate(`document.querySelector('[data-testid="notify-conversations"]').innerText`)
  assert.ok(bell.includes('Plan de la API'), 'the bell names the pending conversation')
  await screenshot('bell-conversations')
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)

  // «Revisar plan» abre la conversación en la tarjeta del plan.
  await evaluate(`(() => {
    const toast = [...document.querySelectorAll('${TOAST}')].find((item) => item.innerText.includes('Plan de la API'))
    const action = [...(toast?.querySelectorAll('button') ?? [])].find((button) => button.innerText.includes('Revisar plan'))
    action?.click()
    return Boolean(action)
  })()`)
  await wait(`Boolean(document.querySelector('[data-testid="plan-card"]'))`)
  await wait(`document.querySelector('aside [aria-current="page"]')?.innerText.includes('Plan de la API')`)
  await screenshot('plan-opened')
  report({ passed: [
    'a plan finished in another Normal chat notifies with its own text and «Revisar plan»',
    'the sidebar marks that conversation',
    'the bell names it under Conversaciones',
    '«Revisar plan» opens the conversation at the plan card',
  ] })
}, { width: 1400, height: 900 })

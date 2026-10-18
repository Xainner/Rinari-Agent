// Crear imágenes (plan 0.4.0 #28) con el Engine real y un servicio de
// imágenes falso en loopback (la API de OpenAI Images):
// 1. Sin servicio configurado, los ajustes empiezan vacíos.
// 2. Con el servicio configurado, Rinari llama a image.generate: en un chat
//    (modo Proyecto) pregunta antes, con el servicio y el costo estimado.
// 3. Al permitirlo, la imagen se guarda en la conversación y llega con la
//    tarjeta de entrega; el servicio recibió la petición con su clave.
const assert = require('node:assert/strict')
const http = require('node:http')
const { click, clickText, command, evaluate, input, key, menuShortcut, reload, report, scenario, screenshot, settleAnimations, ui, until, useLocalModel, wait } = require('../harness.cjs')

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAIAAABt+uBvAAAA1klEQVR4nO3SMRHAIAAEQYhKfCGYKIAzsNt+d/NzrzO4+x4bAjUPCgIFgYJAQaAgUBAoCBQECgIFgYJAQaAgUBAoCBQECgIFgYJAQaAgUBAoCBQECgIFgYJAQaAgUBAoCBQECgIFgYJAQaAgUBAoCBQECgIFgYJAQaAgUBAoCBQECgIFgYJAQaAgUBAoCBQECgIFgYJAQaAgUBAoCBQECgIFgYJAQaAgUBAoCBQECgIFgYJAQaAgUBAoCBQECgIFgYJAQaAgUBAoCBQECgIFgYJAQaDx9gOKaAKqWNjhsgAAAABJRU5ErkJggg=='
const CARD = '.approval-card[data-state="open"]'
const PRESENTED = '[data-testid="presented-files"]'
const pending = () => fetch(new URL('/__pending?lane=main', ui.model)).then((r) => r.json())
async function release() {
  await until(async () => await pending() > 0, 'model waits for the next step')
  assert.equal(await fetch(new URL('/__release?lane=main', ui.model)).then((r) => r.json()), true)
}

scenario(async () => {
  // The fake image service: what the Engine sends, and a purple PNG back.
  const requests = []
  const service = http.createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      requests.push({ path: req.url, auth: req.headers.authorization, body: body ? JSON.parse(body) : null })
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ data: [{ b64_json: PNG }] }))
    })
  })
  await new Promise((resolve) => service.listen(0, '127.0.0.1', resolve))
  const endpoint = `http://127.0.0.1:${service.address().port}/v1`
  try {
    await useLocalModel()

    // 1. No service yet.
    await command('session_create', { chat: true, title: 'Luna' })
    await reload()
    const empty = await command('images_settings_get', {})
    assert.deepEqual(empty.connectors, [])
    assert.equal(empty.default_connector, null)

    // 2. Configure the service (the key goes once and comes back as has_key).
    const saved = await command('images_settings_set', { settings: {
      connectors: [{ id: 'openai', kind: 'openai', label: 'OpenAI (API)', api_key: 'sk-fake-images', model: 'gpt-image-1', endpoint }],
      default_connector: 'openai', edit_connector: null, session_budget_usd: null,
    } })
    assert.equal(saved.connectors[0].has_key, true)
    assert.equal(JSON.stringify(saved).includes('sk-fake-images'), false, 'the key never comes back')

    await click('.view-switcher button[aria-label="Normal"]')
    await clickText('Luna', 'aside li button', { includes: true })
    await wait('Boolean(document.querySelector(".composer-surface"))')
    await input('.composer-surface textarea', 'Hazme una luna morada')
    await click('.composer-surface textarea')
    await key('Enter')
    await release() // capability.search loads image.generate
    await release() // image.generate → the approval
    await wait(`Boolean(document.querySelector('${CARD}'))`)
    await wait(`document.querySelector('${CARD}').innerText.includes('Crear o editar una imagen con un servicio')`)
    const card = await evaluate(`document.querySelector('${CARD}').innerText`)
    assert.match(card, /OpenAI \(API\)/)
    assert.match(card, /~\$0\.011/)
    await settleAnimations()
    await screenshot('approval-with-cost')
    await clickText('Permitir una vez', `${CARD} button`)

    // 3. The image is delivered with the card, and the service got the key.
    await wait(`document.querySelector('${PRESENTED} [data-thumb="image"]')?.dataset.state === 'ready'`, 30_000)
    await release() // LUNA LISTA
    await wait(`document.body.innerText.includes('LUNA LISTA')`)
    assert.equal(requests.length, 1)
    assert.equal(requests[0].path, '/v1/images/generations')
    assert.equal(requests[0].auth, 'Bearer sk-fake-images')
    assert.equal(requests[0].body.prompt, 'Una luna morada sobre fondo oscuro')
    assert.equal(requests[0].body.quality, 'low')
    await settleAnimations()
    await screenshot('image-delivered')
    // Ajustes → Visión e imágenes: el servicio en la lista y los demás como fichas con su logo.
    await menuShortcut('settings', 'CmdOrCtrl+,')
    await clickText('Visión e imágenes', 'nav button')
    await wait(`Boolean(document.querySelector('[data-testid="image-creation-settings"] .image-kinds'))`)
    await evaluate(`document.querySelector('[data-testid="image-creation-settings"]').scrollIntoView({ block: 'start' })`)
    await settleAnimations()
    await screenshot('image-settings')
    report({ passed: ['no service yet', 'key stored as a reference', 'approval with service and cost', 'image delivered with the card', 'service called with the key'], requests: requests.length })
  } finally {
    service.close()
  }
})

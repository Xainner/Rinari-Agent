// Conectores (plan de conectores C4) con el Engine real y un servidor MCP
// falso por stdio (node, sin red):
// 1. «Importar de otra app» encuentra el servidor de Codex (CODEX_HOME del
//    escenario); solo se importa lo marcado y su secreto no se ve.
// 2. «Pegar JSON» hace lo mismo con un `mcpServers` pegado.
// 3. El importado de Codex conecta en segundo plano: «Conectado».
// 4. Un proyecto de confianza con `.mcp.json`: al abrir su conversación,
//    Rinari pregunta por su servidor; «Usar en este proyecto» lo crea con
//    ámbito de proyecto, y al volver no se pregunta otra vez.
// 5. El detalle dice «Solo en este proyecto», su carpeta y que es de confianza.
const assert = require('node:assert/strict')
const { join } = require('node:path')
const { clickText, command, domClick, evaluate, input, key, menuShortcut, reload, report, scenario, screenshot, settleAnimations, until, ui, useLocalModel, wait } = require('../harness.cjs')

const VIEW = '[data-testid="connectors-view"]'
const IMPORT = '[data-testid="connector-import"]'
const OFFERS = '[data-testid="project-offers"]'
const card = (name) => `${VIEW} [data-connector="${name}"]`
const stateOf = (name) => evaluate(`document.querySelector(${JSON.stringify(card(name))})?.dataset.state ?? null`)
const SECRETS = ['secreto-de-codex', 'valor-secreto-pegado', 'secreto-del-proyecto']
const noSecretShown = async (where) => {
  const text = await evaluate('document.body.innerText')
  for (const secret of SECRETS) assert.equal(text.includes(secret), false, `${where}: a secret value is never shown`)
}
const itemSelector = (name) => `[...document.querySelectorAll('${IMPORT} .import-item')].find((item) => item.querySelector('b')?.textContent === ${JSON.stringify(name)})`

async function openConnectors() {
  await menuShortcut('settings', 'CmdOrCtrl+,')
  await clickText('Conectores', 'nav button')
  await wait(`Boolean(document.querySelector(${JSON.stringify(VIEW)}))`)
}

scenario(async () => {
  const passed = []
  const server = join(ui.data, 'fake-mcp.cjs').replace(/\\/g, '/')

  // 1. From another app: only Codex's server is ticked; nothing else is imported.
  await openConnectors()
  await clickText('Importar de otra app', `${VIEW} button`, { includes: true })
  await wait(`Boolean(${itemSelector('notas')})`, 60_000)
  assert.equal(await evaluate(`[...document.querySelectorAll('${IMPORT} input[type=checkbox]')].some((box) => box.checked)`), false, 'nothing starts ticked')
  assert.match(await evaluate(`${itemSelector('notas')}.innerText`), /NOTAS_TOKEN/)
  const before = (await command('mcp_list', {})).servers.length
  await evaluate(`${itemSelector('notas')}.querySelector('input[type=checkbox]').click()`)
  await domClick('[data-testid="import-apply"]')
  await wait(`${itemSelector('notas')}.innerText.includes('Importado')`)
  const afterApps = (await command('mcp_list', {})).servers
  assert.equal(afterApps.length, before + 1, 'only the ticked server is imported')
  const notas = afterApps.find((item) => item.name === 'notas')
  assert.equal(notas.env.find((entry) => entry.name === 'NOTAS_TOKEN').configured, true)
  await noSecretShown('import from apps')
  passed.push('import from another app: only what is ticked, secret kept hidden')

  // 2. Pasted JSON.
  await clickText('Pegar JSON', `${IMPORT} [role="tab"]`)
  await input('#import-json', JSON.stringify({ mcpServers: { pegado: { command: 'node', args: [server], env: { API_KEY: 'valor-secreto-pegado' } } } }))
  await clickText('Leer', `${IMPORT} button`)
  await wait(`Boolean(${itemSelector('pegado')})`)
  await evaluate(`${itemSelector('pegado')}.querySelector('input[type=checkbox]').click()`)
  await settleAnimations()
  await screenshot('01-paste-json')
  await domClick('[data-testid="import-apply"]')
  await wait(`${itemSelector('pegado')}.innerText.includes('Importado')`)
  await noSecretShown('pasted JSON')
  await key('Escape')
  passed.push('pasted JSON imports the ticked server, secret kept hidden')

  // 3. The imported server connects in the background.
  await until(async () => (await stateOf('notas')) === 'connected', 'the imported server connects', 60_000)
  assert.match(await evaluate(`document.querySelector(${JSON.stringify(card('notas'))}).innerText`), /2 herramientas/)
  await settleAnimations()
  await screenshot('02-imported-connected')
  passed.push('the imported server connects in the background')

  // 4. A trusted project with a .mcp.json: asked once per server.
  const root = join(ui.data, 'workspace', 'tienda')
  await useLocalModel() // the conversation needs a model; no turn is sent
  const { project } = await command('project_add', { path: root, name: 'Tienda' })
  await command('project_trust', { path: root })
  await command('session_create', { project_id: project.id, title: 'Tienda con servidores' })
  await reload()
  await clickText('Tienda con servidores', 'aside button', { includes: true })
  await wait(`Boolean(document.querySelector('${OFFERS} [data-key="inventario"]'))`, 30_000)
  const offer = await evaluate(`document.querySelector('${OFFERS}').innerText`)
  assert.match(offer, /Esta carpeta trae 1 servidor MCP/)
  assert.match(offer, /INVENTARIO_KEY/)
  await noSecretShown('project offer')
  await settleAnimations()
  await screenshot('03-project-offer')
  await domClick(`${OFFERS} [data-key="inventario"] [role="radio"][data-value="accept"]`)
  await domClick('[data-testid="offers-save"]')
  await wait(`!document.querySelector('${OFFERS}')`)
  const created = (await command('mcp_list', {})).servers.find((item) => item.name === 'inventario')
  assert.equal(created?.scope, 'project')
  assert.ok(created.project_root, 'it belongs to its folder')
  assert.equal((await command('mcp_project_offers_list', { path: root })).offers.length, 0, 'the answer is recorded')
  await reload()
  await clickText('Tienda con servidores', 'aside button', { includes: true })
  await new Promise((resolve) => setTimeout(resolve, 2500))
  assert.equal(await evaluate(`Boolean(document.querySelector('${OFFERS}'))`), false, 'it is not asked again')
  passed.push('.mcp.json of a trusted project asked once, created with project scope')

  // 5. Scope and trust in the detail.
  await openConnectors()
  await wait(`Boolean(document.querySelector(${JSON.stringify(card('inventario'))}))`)
  assert.match(await evaluate(`document.querySelector(${JSON.stringify(card('inventario'))}).innerText`), /Este proyecto/)
  await clickText('Detalles', `${card('inventario')} button`)
  await clickText('Conexión', '[data-testid="connector-detail"] [role="tab"]')
  await wait(`document.querySelector('[data-testid="connector-scope"] [data-trust="trusted"]') !== null`)
  const scope = await evaluate(`document.querySelector('[data-testid="connector-scope"]').innerText`)
  assert.match(scope, /Solo en este proyecto/)
  assert.match(scope, /tienda/)
  await settleAnimations()
  await screenshot('04-scope-trusted')
  passed.push('the detail shows project scope, its folder and that it is trusted')

  report({ passed })
}, { timeout: 360_000 })

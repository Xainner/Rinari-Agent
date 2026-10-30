// Conectores (plan de conectores C3) con el Engine real y un servidor MCP
// falso en loopback que inicia sesión con OAuth (metadatos del recurso,
// registro dinámico, PKCE, token y revocación):
// 1. Ajustes → Conectores empieza vacío; «Agregar conector» abre el catálogo.
// 2. GitHub desde el catálogo pide solo el token; el proxy muerto deja el
//    conector en «Error» con su pista, y el token nunca se ve.
// 3. «Agregar servidor MCP» con OAuth: al guardar se inicia sesión. El
//    «navegador» es un script (BROWSER) que aprueba solo; la ventana muestra
//    cada etapa y «Sesión iniciada», y la tarjeta pasa a «Conectado».
// 4. Detalle: Bloquear una herramienta, Preguntar por defecto y corregir una
//    anotación; el Engine lo guarda.
// 5. El servidor se cae: «Reconectar» lo deja en «Error»; vuelve y
//    «Reconectar» lo conecta.
// 6. «Desconectar cuenta» revoca el token en el servicio.
const assert = require('node:assert/strict')
const http = require('node:http')
const { createHash } = require('node:crypto')
const { click, clickText, command, domClick, evaluate, input, key, menuShortcut, report, scenario, screenshot, settleAnimations, until, wait } = require('../harness.cjs')

const VIEW = '[data-testid="connectors-view"]'
const card = (name) => `${VIEW} [data-connector="${name}"]`
const DIALOG = '[role="dialog"]'
const stateOf = (name) => evaluate(`document.querySelector(${JSON.stringify(card(name))})?.dataset.state ?? null`)

/** Servidor de recursos MCP + servidor de autorización, como el falso de las pruebas de C1. */
function fakeOAuthServer() {
  const state = { base: '', down: false, clients: {}, codes: {}, access: new Set(), revoked: [], registrations: 0, authorize: 0 }
  const json = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers })
    res.end(JSON.stringify(body))
  }
  const server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => {
      const url = new URL(req.url, state.base)
      if (state.down) return json(res, 503, { error: 'unavailable' })
      if (req.method === 'GET' && url.pathname === '/.well-known/oauth-protected-resource/mcp') {
        return json(res, 200, { resource: `${state.base}/mcp`, authorization_servers: [state.base], scopes_supported: ['notes'] })
      }
      if (req.method === 'GET' && url.pathname === '/.well-known/oauth-authorization-server') {
        return json(res, 200, {
          issuer: state.base, authorization_endpoint: `${state.base}/authorize`, token_endpoint: `${state.base}/token`,
          registration_endpoint: `${state.base}/register`, revocation_endpoint: `${state.base}/revoke`,
          code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'],
        })
      }
      if (req.method === 'POST' && url.pathname === '/register') {
        const body = JSON.parse(raw)
        state.registrations += 1
        const clientId = `dcr-${state.registrations}`
        state.clients[clientId] = body.redirect_uris
        return json(res, 201, { client_id: clientId, redirect_uris: body.redirect_uris, token_endpoint_auth_method: 'none' })
      }
      if (req.method === 'GET' && url.pathname === '/authorize') {
        state.authorize += 1
        const q = Object.fromEntries(url.searchParams)
        const redirect = q.redirect_uri ?? ''
        const ok = q.response_type === 'code' && q.code_challenge_method === 'S256' && q.code_challenge && q.state
          && q.resource === `${state.base}/mcp` && (state.clients[q.client_id] ?? []).includes(redirect) && redirect.startsWith('http://127.0.0.1:')
        if (!ok) return json(res, 400, { error: 'invalid_request' })
        const code = `code-${state.authorize}`
        state.codes[code] = q
        res.writeHead(302, { location: `${redirect}?code=${code}&state=${encodeURIComponent(q.state)}` })
        return res.end()
      }
      if (req.method === 'POST' && url.pathname === '/token') {
        const form = Object.fromEntries(new URLSearchParams(raw))
        const request = state.codes[form.code]
        const challenge = createHash('sha256').update(form.code_verifier ?? '').digest('base64url')
        if (form.grant_type !== 'authorization_code' || !request || request.code_challenge !== challenge || request.redirect_uri !== form.redirect_uri) {
          return json(res, 400, { error: 'invalid_grant' })
        }
        delete state.codes[form.code]
        const token = `at-${state.authorize}-prueba`
        state.access.add(token)
        return json(res, 200, { access_token: token, refresh_token: `rt-${state.authorize}-prueba`, token_type: 'Bearer', expires_in: 3600, scope: 'notes' })
      }
      if (req.method === 'POST' && url.pathname === '/revoke') {
        const form = Object.fromEntries(new URLSearchParams(raw))
        state.revoked.push(form.token)
        state.access.delete(form.token)
        return json(res, 200, {})
      }
      if (url.pathname === '/mcp') {
        if (req.method === 'DELETE') return json(res, 200, {})
        const token = (req.headers.authorization ?? '').replace(/^Bearer /, '')
        if (!state.access.has(token)) {
          return json(res, 401, { error: 'invalid_token' }, { 'www-authenticate': `Bearer error="invalid_token", resource_metadata="${state.base}/.well-known/oauth-protected-resource/mcp"` })
        }
        const msg = JSON.parse(raw || '{}')
        if (msg.method?.startsWith('notifications/')) { res.writeHead(202); return res.end() }
        let result
        if (msg.method === 'initialize') result = { protocolVersion: msg.params?.protocolVersion ?? '2025-06-18', serverInfo: { name: 'notas-falsas', version: '1' }, capabilities: { tools: {} } }
        else if (msg.method === 'tools/list') {
          result = { tools: [
            { name: 'read_notes', title: 'Leer notas', description: 'Lee las notas guardadas.', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
            { name: 'delete_note', title: 'Borrar nota', description: 'Borra una nota para siempre.', inputSchema: { type: 'object' }, annotations: { destructiveHint: true } },
            { name: 'send_note', title: 'Enviar nota', description: 'Envía una nota por correo.', inputSchema: { type: 'object' }, annotations: { openWorldHint: true } },
          ] }
        } else return json(res, 200, { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'not found' } })
        return json(res, 200, { jsonrpc: '2.0', id: msg.id, result }, msg.method === 'initialize' ? { 'mcp-session-id': 's-1' } : {})
      }
      json(res, 404, { error: 'not_found' })
    })
  })
  return { state, server }
}

scenario(async () => {
  const { state, server } = fakeOAuthServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  state.base = `http://127.0.0.1:${server.address().port}`
  const passed = []
  try {
    // 1. Settings → Connectors, empty; the catalog.
    await menuShortcut('settings', 'CmdOrCtrl+,')
    await clickText('Conectores', 'nav button')
    await wait(`Boolean(document.querySelector(${JSON.stringify(VIEW)}))`)
    await wait(`document.querySelector(${JSON.stringify(VIEW)}).innerText.includes('Aún no hay conectores')`)
    await settleAnimations()
    await screenshot('01-empty')
    await clickText('Agregar conector', `${VIEW} button`, { includes: true })
    await wait(`document.querySelectorAll('[data-testid="connector-catalog"] [data-entry]').length > 10`)
    await settleAnimations()
    await screenshot('02-catalog')
    // Every catalog entry has its official logo (none falls back to initials), and only the list scrolls.
    // Entries still in preview are not offered (7dd2a2f8), so the count follows the catalog.
    const logos = await evaluate(`[...document.querySelectorAll('[data-testid="connector-catalog"] [data-entry] .connector-logo')].map((logo) => Boolean(logo.querySelector('img')))`)
    assert.ok(logos.length > 10 && logos.every(Boolean), `every entry shows a logo (${logos.filter(Boolean).length}/${logos.length})`)
    await evaluate(`(() => { const list = document.querySelector('[data-testid="connector-catalog"] .catalog-scroll'); list.scrollTop = list.scrollHeight; return true })()`)
    await wait(`document.querySelector('[data-testid="connector-catalog"] .catalog-scroll').scrollTop > 0`)
    assert.ok(await evaluate(`document.querySelector('[data-testid="connector-catalog"] .catalog-filters').getBoundingClientRect().top > 0`), 'the filters stay in view while the list scrolls')
    await new Promise((resolve) => setTimeout(resolve, 400))
    await screenshot('02b-catalog-end')
    await evaluate(`(() => { document.querySelector('[data-testid="connector-catalog"] .catalog-scroll').scrollTop = 0; return true })()`)
    passed.push('empty state and catalog')

    // 2. GitHub from the catalog: only the token; the dead proxy leaves a plain error.
    await domClick('[data-testid="connector-catalog"] [data-entry="github"]')
    await wait(`Boolean(document.querySelector('[data-testid="catalog-setup"][data-entry="github"]'))`)
    // Without the token the main button is off, and it looks off: no brand gradient or glow.
    const off = await evaluate(`(() => { const b = document.querySelector('[data-testid="catalog-add"]'); const s = getComputedStyle(b); return { disabled: b.disabled, image: s.backgroundImage, shadow: s.boxShadow } })()`)
    assert.equal(off.disabled, true, 'nothing to add yet')
    assert.equal(off.image, 'none', `a disabled main button drops the gradient (${off.image})`)
    await settleAnimations()
    await screenshot('03a-catalog-github-empty')
    await input('#catalog-token', 'ghp-token-de-prueba')
    await screenshot('03-catalog-github')
    await domClick('[data-testid="catalog-add"]')
    await wait(`Boolean(document.querySelector(${JSON.stringify(card('github'))}))`)
    await until(async () => (await stateOf('github')) === 'error', 'GitHub fails behind the dead proxy', 60_000)
    const github = await evaluate(`document.querySelector(${JSON.stringify(card('github'))}).innerText`)
    assert.match(github, /MCP remoto/)
    assert.match(github, /No se pudo llegar al servidor|Revisa la URL/)
    assert.equal(await evaluate(`document.body.innerText.includes('ghp-token-de-prueba')`), false, 'the token is never shown')
    const saved = (await command('mcp_get', { name: 'github' })).server
    assert.equal(saved.auth.kind, 'bearer')
    assert.equal(saved.auth.token.configured, true)
    passed.push('catalog add asks only for the token; the token stays hidden')

    // 3. «Agregar servidor MCP» with OAuth: saving starts the sign-in.
    await clickText('Agregar conector', `${VIEW} button`, { includes: true })
    await domClick('[data-testid="catalog-manual"]')
    await wait(`Boolean(document.querySelector('[data-testid="mcp-server-dialog"]'))`)
    await clickText('Servidor remoto', '[data-testid="mcp-server-dialog"] button', { includes: true })
    await input('#mcp-name', 'notas')
    await input('#mcp-url', `${state.base}/mcp`)
    await clickText('Iniciar sesión (OAuth)', '[data-testid="mcp-server-dialog"] button', { includes: true })
    await wait(`Boolean(document.querySelector('[data-testid="mcp-oauth-fields"]'))`)
    await settleAnimations()
    await screenshot('04-manual-oauth')
    await clickText('Guardar servidor', '[data-testid="mcp-server-dialog"] button', { includes: true })
    await wait(`Boolean(document.querySelector('[data-testid="connector-signin"]'))`)
    await wait(`document.querySelector('[data-testid="connector-signin"]').dataset.phase === 'signed_in'`, 60_000)
    assert.equal(state.registrations, 1, 'Rinari registered itself as a client')
    assert.equal(state.authorize, 1)
    const signin = await evaluate(`document.querySelector('[data-testid="connector-signin"]').innerText`)
    assert.match(signin, /Sesión iniciada/)
    assert.match(signin, /Rinari está conectando el servidor/)
    await settleAnimations()
    await screenshot('05-signed-in')
    await clickText('Listo', '[data-testid="connector-signin"] button')
    await until(async () => (await stateOf('notas')) === 'connected', 'the server connects after signing in', 60_000)
    const notas = await evaluate(`document.querySelector(${JSON.stringify(card('notas'))}).innerText`)
    assert.match(notas, /Conectado/)
    assert.match(notas, /3 herramientas/)
    assert.match(notas, new RegExp(`Sesión iniciada en 127\\.0\\.0\\.1:${server.address().port}`))
    assert.equal((await command('mcp_auth_status', { name: 'notas' })).signed_in, true)
    await settleAnimations()
    await screenshot('06-connected')
    passed.push('OAuth sign-in with progress, then connected with its tools')

    // 4. Tool permissions in the detail.
    await clickText('Detalles', `${card('notas')} button`)
    await wait(`Boolean(document.querySelector('[data-testid="connector-detail"] [data-tool="delete_note"]'))`)
    await domClick('[data-testid="connector-detail"] [data-tool="delete_note"] [role="radio"][data-value="deny"]')
    await until(async () => (await command('mcp_tools_list', { name: 'notas' })).server.tools.find((tool) => tool.name === 'delete_note').setting === 'deny', 'Block is saved')
    await domClick('[data-testid="connector-default"] [role="radio"][data-value="ask"]')
    await until(async () => (await command('mcp_tools_list', { name: 'notas' })).server.default === 'ask', 'the connector default is saved')
    await evaluate(`document.querySelector('[data-testid="connector-detail"] [data-tool="read_notes"] details').open = true`)
    await click('[data-testid="connector-detail"] [data-tool="read_notes"] button[aria-label^="Solo lee"]')
    await clickText('No', '[role="menuitem"]')
    await until(async () => (await command('mcp_tools_list', { name: 'notas' })).server.tools.find((tool) => tool.name === 'read_notes').annotations.owner?.readOnlyHint === false, 'the corrected annotation is saved')
    const detail = await evaluate(`document.querySelector('[data-testid="connector-detail"]').innerText`)
    assert.match(detail, /Destructiva/)
    assert.match(detail, /Puede enviar datos fuera/)
    await settleAnimations()
    await screenshot('07-detail-tools')
    passed.push('Allow / Ask / Block per tool, default and annotation saved by the Engine')

    // 5. Reconnect: down, then back.
    state.down = true
    await key('Escape')
    await wait(`!document.querySelector('[data-testid="connector-detail"]')`)
    await click(`${card('notas')} button[aria-label^="Más acciones"]`)
    await clickText('Reconectar', '[role="menuitem"]')
    await until(async () => (await stateOf('notas')) === 'error', 'a server that went down shows the error', 60_000)
    await settleAnimations()
    await screenshot('08-down')
    state.down = false
    await domClick(`${card('notas')} button[data-action="reconnect"]`)
    await until(async () => (await stateOf('notas')) === 'connected', 'Reconnect brings it back', 60_000)
    passed.push('Reconnect: error while down, connected when it is back')

    // 6. Disconnect the account: the token is revoked at the service.
    await clickText('Desconectar cuenta', `${card('notas')} button`)
    await clickText('Desconectar cuenta', '[role="alertdialog"] button')
    await until(async () => state.revoked.length > 0, 'the token is revoked')
    await until(async () => (await command('mcp_auth_status', { name: 'notas' })).signed_in === false, 'signed out')
    await wait(`document.querySelector(${JSON.stringify(card('notas'))}).innerText.includes('Sin sesión iniciada')`)
    await settleAnimations()
    await screenshot('09-signed-out')
    passed.push('Disconnect account revokes and deletes the tokens')

    report({ passed, base: state.base })
  } finally {
    server.close()
  }
}, { timeout: 360_000 })

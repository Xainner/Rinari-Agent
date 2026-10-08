const assert = require('node:assert/strict')
const { Tray, shell, app } = require('electron')
const { createServer } = require('node:http')

// Capture the actual native Menu, keeping Electron's tray implementation.
let trayMenu
const setContextMenu = Tray.prototype.setContextMenu
Tray.prototype.setContextMenu = function (menu) {
  trayMenu = menu
  return setContextMenu.call(this, menu)
}
const opened = []
const openExternal = shell.openExternal
shell.openExternal = async (url) => { opened.push(url) }

async function run() {
  // Optional explicit test build: exercise the updater against loopback and
  // leave a useful review window. Ordinary builds verify the unavailable path.
  const enabled = process.env.RINARI_BUILD_UPDATE_E2E === '1'
  if (enabled) {
    const feed = createServer((req, res) => {
      if (!req.url.startsWith('/latest.yml')) { res.writeHead(404); res.end(); return }
      res.setHeader('content-type', 'text/yaml')
      res.end(`version: ${app.getVersion()}\nfiles:\n  - url: fixture.exe\n    sha512: ${Buffer.alloc(64).toString('base64')}\n    size: 1\npath: fixture.exe\nsha512: ${Buffer.alloc(64).toString('base64')}\nreleaseDate: '2026-10-07T00:00:00.000Z'\n`)
    })
    await new Promise(resolve => feed.listen(0, '127.0.0.1', resolve))
    process.env.RINARI_UPDATE_FEED_URL = `http://127.0.0.1:${feed.address().port}`
    app.on('will-quit', () => feed.close())
  }
  const { ui, until, delay, evaluate, wait, command, useLocalModel, seedBoard, panesFor, click, clickText, input, language, size, screenshot, report, scenario } = require('../harness.cjs')
  const labels = () => trayMenu.items.filter(item => item.type !== 'separator').map(item => item.label)
  async function activate(label) {
    await until(() => trayMenu?.items.some(item => item.label === label), `tray has ${label}`)
    ui.win.hide()
    assert.equal(ui.win.isVisible(), false)
    trayMenu.items.find(item => item.label === label).click()
    await until(() => ui.win.isVisible(), 'tray action reveals the window')
    await delay(300)
  }
  async function noCounter() {
    const text = await evaluate(`document.querySelector('.app-topbar').innerText`)
    assert(!/en ejecución|\d+ running/.test(text), 'No running counter in title bar')
  }
  scenario(async () => {
    await until(() => trayMenu, 'native tray exists')
    await language('es')
    await until(() => labels().includes('Configuración…'), 'Spanish tray refresh')
    assert.deepEqual(labels(), ['Abrir Rinari', 'Configuración…', 'Buscar actualizaciones', 'Reportar error…', 'Salir'])
    await activate('Configuración…')
    await wait(`document.body.innerText.includes('Por defecto solo suena lo que pasa donde no estás mirando.')`)
    await screenshot('settings-from-hidden')
    await activate('Buscar actualizaciones')
    await wait(`document.body.innerText.includes('Notas de la versión')`)
    if (enabled) await wait(`document.body.innerText.includes('Ya tienes la última versión') || document.body.innerText.includes('Rinari Agent está actualizado.')`)
    else await wait(`document.body.innerText.includes('El actualizador solo funciona')`)
    await screenshot('updates-from-hidden')
    await activate('Reportar error…')
    await until(() => opened.length === 1, 'bug draft opened once')
    const url = new URL(opened[0])
    assert.equal(url.origin + url.pathname, 'https://github.com/Xainner/Rinari-Agent/issues/new')
    assert.equal(url.searchParams.get('labels'), 'bug')
    assert(url.searchParams.get('body').includes('**Qué pasó**'))
    assert(url.searchParams.get('body').includes('Rinari Engine:'))
    assert(!url.searchParams.get('body').includes(ui.data))

    await language('en')
    await until(() => labels().includes('Report a bug…'), 'English tray refresh')
    assert.deepEqual(labels(), ['Open Rinari', 'Settings…', 'Check for updates', 'Report a bug…', 'Quit'])
    await activate('Report a bug…')
    await until(() => opened.length === 2, 'English bug draft')
    assert(new URL(opened[1]).searchParams.get('body').includes('**What happened**'))
    await language('es')
    await useLocalModel()
    const ids = []
    for (const title of ['Prueba de bandeja', 'Segundo panel']) ids.push((await command('session_create', { chat: true, title })).session.id)
    await seedBoard({ boardId: 'tray_titlebar', panes: panesFor(ids), focusedPaneId: 'pane_0' })
    await click('.view-switcher button[aria-label="Normal"]')
    await clickText('Prueba de bandeja', 'aside button', { includes: true })
    await input('.composer-surface textarea', 'Mantén este turno activo durante la prueba')
    await click('.composer-surface button[aria-label="Enviar mensaje"]')
    await until(async () => await fetch(new URL('/__pending', ui.model)).then(r => r.json()), 'real Engine turn stays active')
    await noCounter()
    await screenshot('normal-active-without-counter')
    await click('.view-switcher button[aria-label^="Boards"]')
    await wait(`document.querySelectorAll('[data-pane-id]').length === 2`)
    await noCounter()
    await screenshot('boards-active-without-counter')
    await size(900, 700)
    await noCounter()
    await screenshot('narrow-boards')
    await fetch(new URL('/__release', ui.model))
    await wait(`document.body.innerText.includes('PRUEBA DE BANDEJA TERMINADA')`)
    await size(1400, 900)
    await activate('Abrir Rinari')
    await noCounter()
    report({ ok: true, labels: labels(), updater: enabled ? 'loopback up-to-date' : 'development unavailable', bugDrafts: opened.length, hiddenWindow: true, activeTurnNormalAndBoards: true, narrow: true })
    // Owner review should use the normal opener; automated tests never submit
    // or open GitHub and never download or apply an update.
    shell.openExternal = openExternal
  })
}
run().catch(error => { console.error(error); app.exit(1) })

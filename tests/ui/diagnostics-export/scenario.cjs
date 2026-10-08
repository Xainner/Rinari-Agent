const assert = require('node:assert/strict')
const { dialog, shell } = require('electron')
const { existsSync, mkdtempSync, readFileSync } = require('node:fs')
const { homedir, tmpdir } = require('node:os')
const { join } = require('node:path')
const { inflateRawSync } = require('node:zlib')

// The native save dialog is answered with a temporary path; the real export
// writes the real bundle there. Revealing it in the file manager is recorded.
const target = join(mkdtempSync(join(tmpdir(), 'rinari-diag-export-')), 'rinari-diagnostico.zip')
const saveRequests = []
dialog.showSaveDialog = async (...args) => {
  saveRequests.push(args.at(-1))
  return { canceled: false, filePath: target }
}
const revealed = []
shell.showItemInFolder = (path) => { revealed.push(path) }

function unzip(buffer) {
  const files = {}
  let offset = 0
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8)
    const size = buffer.readUInt32LE(offset + 18)
    const nameLength = buffer.readUInt16LE(offset + 26)
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString('utf8')
    const start = offset + 30 + nameLength
    const body = buffer.subarray(start, start + size)
    files[name] = method === 8 ? inflateRawSync(body) : body
    offset = start + size
  }
  return files
}

const { ui, command, evaluate, wait, click, until, useLocalModel, input, screenshot, report, scenario } = require('../harness.cjs')

scenario(async () => {
  await useLocalModel()
  const session = (await command('session_create', { chat: true, title: 'Diagnóstico' })).session.id
  // A real failed request: the app log keeps its name and code, never its arguments.
  const failed = await evaluate(`window.rinariDesktop.command('session_history', { reference: 'ses-no-existe-ARGUMENTO-PRIVADO' }).then(() => 'ok', (error) => error.code ?? String(error))`)
  assert.equal(failed, 'NOT_FOUND')
  await evaluate(`window.rinariDesktop.command('session_history', { reference: ${JSON.stringify(session)} })`)

  ui.win.webContents.send('rinari:push.menuAction', 'about')
  await wait(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Exportar')`)
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Exportar').scrollIntoView({block:'center'})`)
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Exportar').click()`)
  await wait(`document.body.innerText.includes('logs/app.log') && document.body.innerText.includes('summary.json')`)
  await screenshot('preview')
  assert.equal(saveRequests.length, 0, 'nothing is written before confirming')
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Guardar…').click()`)
  await until(() => existsSync(target) && revealed.length === 1, 'bundle written and revealed')
  assert.equal(revealed[0], target)
  assert.match(saveRequests[0].defaultPath, /rinari-diagnostico-\d{8}-\d{4}\.zip$/)
  await wait(`document.body.innerText.includes('Diagnóstico guardado')`)
  await screenshot('saved')

  const files = unzip(readFileSync(target))
  const names = Object.keys(files)
  assert(names.includes('summary.json') && names.includes('logs/app.log'), names.join(', '))
  const summary = JSON.parse(files['summary.json'].toString('utf8'))
  assert.equal(summary.engine_status.state, 'ready')
  assert(summary.engine_states.some((entry) => entry.state === 'ready'))
  const engine = summary.engine.diagnostics
  assert(engine, `engine.diagnostics answered: ${JSON.stringify(summary.engine).slice(0, 200)}`)
  assert(engine.storage.sessions >= 1)
  assert(engine.recent_requests.some((entry) => entry.method === 'session.history' && entry.code === 'NOT_FOUND'))
  assert(engine.providers.some((row) => row.endpoint === 'local' && row.product_id === 'custom'))

  const appLog = files['logs/app.log'].toString('utf8')
  assert.match(appLog, /INFO {2}engine ready/)
  assert.match(appLog, /command session_history failed: NOT_FOUND/)
  const everything = names.map((name) => files[name].toString('utf8')).join('\n')
  assert(!everything.includes('ARGUMENTO-PRIVADO'), 'request arguments never reach the bundle')
  assert(!everything.includes('Diagnóstico"'), 'session titles never reach the bundle')
  assert(!everything.toLowerCase().includes(homedir().toLowerCase()), 'the home folder appears as ~')
  report({ realEngine: true, files: names, bytes: readFileSync(target).length, checks: ['preview before saving', 'save dialog and reveal', 'engine diagnostics in summary', 'failed command logged by name and code', 'no arguments, titles or home path'] })
}, { width: 1300, height: 900 })

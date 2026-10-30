// Arranque (#70, #91): el Engine se lanza a la vez que carga la ventana, la
// ventana se muestra sin el respaldo fijo de 1,5 s, la línea de tiempos queda
// en Avanzado y lo que tardó el saludo se recuerda para el próximo límite.
const assert = require('node:assert/strict')
const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const { app } = require('electron')
const { evaluate, report, scenario, wait } = require('../harness.cjs')

/** Umbral generoso para una máquina cargada: avisa de una regresión grande, no de ruido. */
const MAX_HELLO_MS = 30_000

scenario(async () => {
  await wait(`window.rinariDesktop && true`)
  const host = await evaluate('window.rinariDesktop.app.hostSettings()')
  const steps = Object.fromEntries(host.startupTimeline.map((entry) => [entry.step, entry.ms]))
  for (const step of ['process', 'ready', 'engine-spawn', 'window', 'engine-hello']) {
    assert.ok(step in steps, `falta el paso ${step}: ${JSON.stringify(host.startupTimeline)}`)
  }
  // El Engine se lanzó antes de que la ventana terminara de cargar (#91.2).
  assert.ok(steps['engine-spawn'] <= steps.window, JSON.stringify(steps))
  assert.ok(steps['engine-hello'] < MAX_HELLO_MS, `el saludo tardó ${steps['engine-hello']} ms`)
  assert.ok(host.lastStartupMs > 0, 'lo que tardó el saludo se guarda')
  const file = join(app.getPath('userData'), 'host-settings.json')
  assert.ok(existsSync(file))
  assert.ok(JSON.parse(readFileSync(file, 'utf8')).lastStartupMs > 0)
  // «Automático»: el próximo límite sale de lo que tardó (entre 30 y 60 s).
  assert.equal(host.startupLimit, 'auto')
  assert.ok(host.startupLimitS >= 30 && host.startupLimitS <= 60, String(host.startupLimitS))
  report({ steps, lastStartupMs: host.lastStartupMs, startupLimitS: host.startupLimitS })
})

// Dictado en el composer con el Engine real.
//
// Con RINARI_E2E_WHISPER_DIR (carpeta con whisper-cli.exe y sus DLL, el
// modelo ggml-small-q5_1.bin y frase.wav) Chromium simula un micrófono que
// «habla» frase.wav y todo es real: whisper.cpp transcribe, el texto queda en
// el composer sin enviarse, y con «Enviar al terminar» se envía solo.
// Sin esa carpeta (CI) comprueba que el micrófono explica qué falta.
const { join } = require('node:path')
const { existsSync } = require('node:fs')
const { app } = require('electron')

const whisperDir = process.env.RINARI_E2E_WHISPER_DIR || ''
const real = Boolean(whisperDir) && existsSync(join(whisperDir, 'ggml-small-q5_1.bin'))
if (real) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream')
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream')
  app.commandLine.appendSwitch('use-file-for-fake-audio-capture', join(whisperDir, 'frase.wav'))
  process.env.RINARI_WHISPER_BIN = join(whisperDir, 'bin', 'Release', 'whisper-cli.exe')
}

const assert = require('node:assert/strict')
const { click, clickText, command, delay, menuShortcut, reload, report, scenario, screenshot, useLocalModel, wait } = require('../harness.cjs')

const MIC = '[data-testid="dictation-button"]'
const BOX = '.composer-surface textarea'
const SPOKEN = 'configuración del proyecto'

async function dictate(seconds) {
  await click(MIC)
  await wait(`document.querySelector('${MIC}')?.dataset.state === 'recording'`)
  await delay(seconds * 1000)
  await screenshot(`recording-${seconds}s`)
  await click(MIC)
}

scenario(async () => {
  await useLocalModel()
  const session = (await command('session_create', { chat: true, title: 'Dictado' })).session.id
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Dictado', 'aside button', { includes: true })
  await wait(`Boolean(document.querySelector('${MIC}'))`)

  if (!real) {
    // CI: no model and no bundled whisper in a dev build. The mic says so.
    await click(MIC)
    await wait(`Boolean(document.querySelector('[data-testid="dictation-setup"]'))`)
    await screenshot('setup')
    report({ session, passed: ['the microphone explains what is missing'], skipped: ['real transcription (set RINARI_E2E_WHISPER_DIR)'] })
    return
  }

  const status = await command('speech_status')
  assert.equal(status.ready, true, 'whisper and the model are in place')

  // 1. Dictate: the text lands in the composer and is not sent.
  await dictate(8)
  await wait(`document.querySelector('${BOX}').value.includes(${JSON.stringify(SPOKEN)})`, 60000)
  await screenshot('dictated')
  const turns = await command('session_history', { session_id: session }).catch(() => ({ messages: [] }))
  assert.equal((turns.messages ?? []).filter((m) => m.role === 'user').length, 0, 'not sent by default')

  // 2. «Enviar al terminar» sends it by itself.
  await menuShortcut('settings', 'CmdOrCtrl+,')
  await clickText('Dictado', 'nav button')
  await click('[data-testid="dictation-settings"] button[role="switch"]')
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Dictado', 'aside button', { includes: true })
  await wait(`Boolean(document.querySelector('${BOX}'))`)
  await wait(`!document.querySelector('${MIC}').disabled`)
  await dictate(8)
  await wait(`document.body.innerText.includes('DICTADO RECIBIDO')`, 90000)
  await screenshot('sent')
  report({ session, passed: ['real whisper transcription into the composer', 'not sent by default', 'send when done'] })
}, { width: 1400, height: 900 })

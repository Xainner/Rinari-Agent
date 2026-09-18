#!/usr/bin/env node
// Engine falso para los tests del host (documento 02 §8): produce hello,
// eventos intercalados, Unicode partido, respuestas tardías, EOF, stderr
// voluminoso y cierre. No habla con ningún modelo ni toca el disco.
//
// El escenario llega por RINARI_FAKE_SCENARIO. Los métodos se responden de
// forma determinista para que un test afirme sobre el transporte, no sobre la
// suerte de un proveedor.

import process from 'node:process'

const scenario = process.env.RINARI_FAKE_SCENARIO ?? 'default'

// El PID por stderr: deja que un test compruebe que el proceso murió de
// verdad tras un handshake fallido, sin contar procesos del sistema.
process.stderr.write(`PID ${process.pid}\n`)

// Las capabilities que el supervisor exige para conectar; el escenario
// `outdated` las recorta para probar el rechazo.
const REQUIRED = [
  'desktop_turn_runtime_v3',
  'tool_contracts_v1',
  'desktop_workspace_v1',
  'interactive_questions_v1',
  'web_preview_v1',
  'plan_read_scope_v1',
  'persistent_context_compaction_v1',
  'recoverable_tool_results_v1',
]

const HELLO = {
  type: 'hello',
  protocol: 'rinari-engine',
  protocol_version: 1,
  engine_version: 'fake-1.0',
  capabilities: {
    chat: true,
    projects: true,
    ...(scenario === 'outdated' ? {} : Object.fromEntries(REQUIRED.map((name) => [name, true]))),
  },
  home_id: 'home_fake',
}

function send(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

function sendRaw(text) {
  process.stdout.write(text)
}

// -- arranque ---------------------------------------------------------------

if (scenario === 'no-hello') {
  // Silencio: el cliente debe caer por plazo de handshake.
} else if (scenario === 'garbage-hello') {
  sendRaw('esto no es JSON\n')
} else if (scenario === 'wrong-protocol') {
  send({ ...HELLO, protocol: 'otro-engine' })
} else if (scenario === 'future-protocol') {
  send({ ...HELLO, protocol_version: 2 })
} else if (scenario === 'die-before-hello') {
  process.exit(3)
} else if (scenario === 'split-unicode') {
  // El hello sale en dos escrituras que parten un carácter multibyte por la
  // mitad: el cliente solo puede decodificar la línea completa.
  const line = `${JSON.stringify({ ...HELLO, engine_version: 'ñandú-🌱' })}\n`
  const bytes = Buffer.from(line, 'utf8')
  const cut = bytes.indexOf(Buffer.from('🌱', 'utf8')) + 2
  process.stdout.write(bytes.subarray(0, cut))
  setTimeout(() => process.stdout.write(bytes.subarray(cut)), 20)
} else if (scenario === 'crlf') {
  sendRaw(`${JSON.stringify(HELLO)}\r\n`)
} else {
  send(HELLO)
}

if (scenario === 'loud-stderr') {
  // stderr abundante desde el primer instante: no debe bloquear ni perder el
  // protocolo de stdout.
  for (let index = 0; index < 500; index += 1) {
    process.stderr.write(`ruido de arranque ${index} ${'x'.repeat(200)}\n`)
  }
}

// -- peticiones -------------------------------------------------------------

let buffer = Buffer.alloc(0)

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk])
  for (;;) {
    const newline = buffer.indexOf(0x0a)
    if (newline === -1) break
    const line = buffer.subarray(0, newline).toString('utf8').trim()
    buffer = buffer.subarray(newline + 1)
    if (line) handle(JSON.parse(line))
  }
})

process.stdin.on('end', () => {
  if (scenario !== 'stay-open') process.exit(0)
})

function handle(request) {
  const { id, method, params } = request

  switch (method) {
    case 'echo':
      send({ id, ok: true, result: { method, params } })
      return

    case 'fail':
      send({
        id,
        ok: false,
        error: { code: 'TURN_RUNNING', message: 'busy', retryable: false, details: {} },
      })
      return

    case 'malformed':
      // `ok:false` sin error: el cliente debe inventar MALFORMED_RESPONSE.
      send({ id, ok: false })
      return

    case 'never':
      // Sin respuesta: el cliente debe caer por su propio plazo.
      return

    case 'late':
      // Responde tarde y, para entonces, ya nadie la espera.
      setTimeout(() => send({ id, ok: true, result: { late: true } }), 300)
      return

    case 'with_events':
      // Eventos intercalados antes y después de la respuesta: el orden y el
      // enrutado por id no pueden mezclarse.
      send({ type: 'event', event: 'model.content.delta', payload: { delta: 'uno' } })
      send({ id, ok: true, result: { accepted: true } })
      send({ type: 'event', event: 'model.content.delta', payload: { delta: 'dos' } })
      return

    case 'noise':
      // Líneas ilegibles y envolturas desconocidas entre medias: se ignoran
      // sin tumbar la conexión.
      sendRaw('no json en absoluto\n')
      send({ type: 'algo_futuro', cosa: 1 })
      send({ id: 'sin_ok' })
      send({ id, ok: true, result: { survived: true } })
      return

    case 'big':
      // Carga grande y legítima, del tamaño de una captura del browser.
      send({ id, ok: true, result: { blob: 'a'.repeat(Number(params?.size ?? 1_000_000)) } })
      return

    case 'unicode':
      send({ id, ok: true, result: { text: 'ñandú 🌱 日本語' } })
      return

    case 'close_stdout':
      // La tubería de un hijo vivo no da EOF aunque cierre su stdout: solo
      // termina al salir el proceso. Salir es el único cierre realista.
      send({ id, ok: true, result: { closing: true } })
      setTimeout(() => process.exit(0), 10)
      return

    case 'exit':
      setTimeout(() => process.exit(7), 10)
      return

    default:
      send({
        id,
        ok: false,
        error: { code: 'UNKNOWN_METHOD', message: `unknown method: ${method}`, retryable: false, details: {} },
      })
  }
}

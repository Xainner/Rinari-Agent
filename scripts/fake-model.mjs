#!/usr/bin/env node
// Modelo falso para la prueba vertical del browser (documento 03 §3).
//
// El §3 exige que la prueba «utiliza el pipeline real de herramientas y
// políticas con modelo falso; no depende de que un LLM produzca casualmente el
// comando correcto». Esto es exactamente eso: un servidor compatible con la
// API de OpenAI que devuelve **llamadas a herramienta guionizadas**.
//
// Lo que se falsea es la respuesta del modelo, no el camino: el adaptador del
// proveedor, el bucle de turno, la policy y la ejecución de herramientas son
// los de producción. Un `RINARI_FAKE_MODEL=1` dentro del Engine habría probado
// otro código distinto del que corre de verdad.

import { createServer } from 'node:http'

/**
 * Un guion es una lista de turnos del modelo. Cada entrada es `{ tool, args, say? }`
 * —pide una herramienta—, `{ text }` —cierra el turno— o `{ httpError }` —el
 * proveedor rechaza la petición con ese estado y cuerpo—.
 * La petición de herramienta lleva una frase para el usuario (`say`), como un
 * modelo bien portado: el Engine no ejecuta un primer lote mudo y pide antes
 * la apertura. `say: ''` guioniza ese lote mudo.
 */
export function scriptedModel(initial = []) {
  let script = [...initial]
  let step = 0
  const served = []

  const nextMessage = () => {
    const entry = script[step] ?? { text: 'listo' }
    step += 1
    served.push(entry)
    if (entry.text !== undefined) {
      return { role: 'assistant', content: entry.text }
    }
    return {
      role: 'assistant',
      content: entry.say ?? 'Voy a ello.',
      tool_calls: [
        {
          id: `call_${step}`,
          type: 'function',
          function: { name: entry.tool, arguments: JSON.stringify(entry.args ?? {}) },
        },
      ],
    }
  }

  const completion = (message) => ({
    id: `chatcmpl-${step}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'fake-vertical',
    choices: [
      {
        index: 0,
        message,
        finish_reason: message.tool_calls ? 'tool_calls' : 'stop',
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  })

  /** La misma respuesta en SSE, por si el adaptador pide streaming. */
  const stream = (message) => {
    const base = { id: `chatcmpl-${step}`, object: 'chat.completion.chunk', model: 'fake-vertical' }
    const chunks = []
    if (message.tool_calls) {
      chunks.push({
        ...base,
        choices: [
          {
            index: 0,
            delta: {
              role: 'assistant',
              ...(message.content ? { content: message.content } : {}),
              tool_calls: message.tool_calls.map((call, index) => ({ index, ...call })),
            },
            finish_reason: null,
          },
        ],
      })
      chunks.push({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })
    } else {
      chunks.push({
        ...base,
        choices: [
          { index: 0, delta: { role: 'assistant', content: message.content }, finish_reason: null },
        ],
      })
      chunks.push({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })
    }
    chunks.push({ ...base, choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })
    return chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n'
  }

  const handler = (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')

    // Canal de control de la prueba: cada paso del §3 necesita que el modelo
    // pida herramientas distintas, y el guion se cambia desde el probe en vez
    // de levantar un servidor por turno.
    if (url.pathname === '/__script') {
      let body = ''
      request.on('data', (chunk) => (body += chunk))
      request.on('end', () => {
        try {
          script = JSON.parse(body || '[]')
          step = 0
          served.length = 0
          response.writeHead(200, { 'Content-Type': 'application/json' })
          response.end(JSON.stringify({ ok: true, steps: script.length }))
        } catch (error) {
          response.writeHead(400, { 'Content-Type': 'application/json' })
          response.end(JSON.stringify({ ok: false, error: String(error) }))
        }
      })
      return
    }

    if (url.pathname === '/__served') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(served))
      return
    }

    if (url.pathname.endsWith('/models')) {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(
        JSON.stringify({
          object: 'list',
          data: [{ id: 'fake-vertical', object: 'model', owned_by: 'rinari-test' }],
        }),
      )
      return
    }

    if (!url.pathname.endsWith('/chat/completions')) {
      response.writeHead(404, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: { message: `no route for ${url.pathname}` } }))
      return
    }

    let body = ''
    request.on('data', (chunk) => (body += chunk))
    request.on('end', () => {
      let wantsStream = false
      try {
        wantsStream = Boolean(JSON.parse(body || '{}').stream)
      } catch {
        wantsStream = false
      }
      // `{ httpError: { status, body, headers } }`: the provider refuses the
      // request (quota, rate limit…) so the error path is the real one.
      const failing = script[step]?.httpError
      if (failing) {
        served.push(script[step])
        step += 1
        response.writeHead(failing.status ?? 500, { 'Content-Type': 'application/json', ...(failing.headers ?? {}) })
        response.end(JSON.stringify(failing.body ?? { error: { message: 'fake failure' } }))
        return
      }
      const message = nextMessage()
      if (wantsStream) {
        response.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        })
        response.end(stream(message))
        return
      }
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(completion(message)))
    })
  }

  return { handler, served, reset: () => (step = 0) }
}

/** Levanta el modelo falso en un puerto efímero de loopback. */
export async function startFakeModel(script = []) {
  const model = scriptedModel(script)
  const server = createServer(model.handler)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  const origin = `http://127.0.0.1:${port}`
  return {
    origin,
    baseUrl: `${origin}/v1`,
    served: model.served,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

/**
 * Varios guiones en un mismo endpoint. `route(body)` elige el carril de cada
 * petición (p. ej. la del título de la conversación, la del coordinador o la
 * de un subagente), así un turno con peticiones concurrentes sigue siendo
 * determinista. Los carriles de `held` esperan a `/__release?lane=<carril>`
 * para responder, una petición por llamada; `/__pending?lane=<carril>` cuenta
 * las retenidas.
 */
export async function startRoutedModel(lanes, route, { held = [] } = {}) {
  const { Readable } = await import('node:stream')
  const models = Object.fromEntries(Object.entries(lanes).map(([lane, script]) => [lane, scriptedModel(script)]))
  const waiting = Object.fromEntries(held.map((lane) => [lane, []]))
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const lane = url.searchParams.get('lane') ?? ''
    if (url.pathname === '/__pending') {
      response.end(JSON.stringify(waiting[lane]?.length ?? 0))
      return
    }
    if (url.pathname === '/__release') {
      const next = waiting[lane]?.shift()
      if (next) next()
      response.end(JSON.stringify(Boolean(next)))
      return
    }
    if (!url.pathname.endsWith('/chat/completions')) {
      models[Object.keys(models)[0]].handler(request, response)
      return
    }
    let body = ''
    request.on('data', (chunk) => (body += chunk))
    request.on('end', () => {
      let parsed = {}
      try { parsed = JSON.parse(body || '{}') } catch { parsed = {} }
      const chosen = route(parsed)
      const replay = Object.assign(Readable.from([body]), { url: request.url, method: request.method, headers: request.headers })
      const answer = () => models[chosen].handler(replay, response)
      if (waiting[chosen]) waiting[chosen].push(answer)
      else answer()
    })
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const origin = `http://127.0.0.1:${server.address().port}`
  return {
    origin,
    baseUrl: `${origin}/v1`,
    close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve) }),
  }
}

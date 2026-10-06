// Catálogo de las pruebas nativas de interfaz. Cada escenario vive en
// `tests/ui/<nombre>/scenario.cjs` y lo arranca `scripts/ui-e2e.mjs`.
//
// - `phases`: procesos de Electron consecutivos sobre los mismos datos (p. ej.
//   `restart` comprueba lo que sobrevive a cerrar la app y el Engine).
// - `model(data)`: levanta el modelo falso en loopback y devuelve
//   `{ baseUrl, close }`. Sin `model`, el escenario usa un proveedor muerto
//   (`127.0.0.1:9`) y los turnos que lance fallan a propósito.
// - `fixtures(data)`: archivos que el escenario necesita en su carpeta.
import { createServer } from 'node:http'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { scriptedModel, startFakeModel } from '../../scripts/fake-model.mjs'

const paragraphs = (count, line) => Array.from({ length: count }, (_, i) => line(i + 1)).join('\n\n')

/**
 * Modelo que retiene la primera petición hasta `/__release`: deja un turno
 * en curso para comprobar que una acción de la interfaz no lo cancela.
 */
async function heldModel(script) {
  const model = scriptedModel(script)
  let held = null
  let hold = true
  const server = createServer((req, res) => {
    if (req.url === '/__pending') { res.end(JSON.stringify(Boolean(held))); return }
    if (req.url === '/__release') {
      hold = false
      const wasConnected = held && !held.res.destroyed
      if (held) { model.handler(held.req, held.res); held.req.resume(); held = null }
      res.end(JSON.stringify({ wasConnected: Boolean(wasConnected) }))
      return
    }
    if (hold && req.url?.endsWith('/chat/completions')) { req.pause(); held = { req, res }; return }
    model.handler(req, res)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  return {
    baseUrl: `${origin}/v1`,
    close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve) }),
  }
}

export const scenarios = {
  'boards-fit': {
    title: 'Boards: Ajustar a la vista',
    phases: ['exercise'],
  },
  'boards-remove-all': {
    title: 'Boards: Quitar todos',
    phases: ['exercise', 'restart'],
    model: () => heldModel([{ text: 'El turno terminó después de quitar los paneles.' }]),
  },
  'boards-side-panel': {
    title: 'Boards: panel lateral cerrado por defecto',
    phases: ['exercise', 'restart'],
  },
  'chat-image-overlay': {
    title: 'Chat: visor de adjuntos sobre la ventana',
    phases: ['exercise'],
    model: () => startFakeModel(Array.from({ length: 20 }, (_, i) => ({
      text: paragraphs(60, (n) => `Párrafo ${n}: Historial de prueba para desplazar la conversación mientras se revisa una imagen. El visor debe mantenerse fijo sobre la ventana.`) + `\n\nFIN DEL TURNO ${i + 1}`,
    }))),
    fixtures: (data) => {
      writeFileSync(join(data, 'nota.txt'), Array.from({ length: 150 }, (_, i) => `Línea ${i + 1}: adjunto de texto con desplazamiento interno.`).join('\n'))
    },
  },
  'chat-scroll-button': {
    title: 'Chat: flecha de bajar junto al composer',
    phases: ['exercise'],
    model: () => startFakeModel(Array.from({ length: 20 }, () => ({
      text: paragraphs(80, (n) => `Párrafo ${n}: Historial de prueba para comprobar el desplazamiento y la posición de la flecha junto al cuadro de mensaje.`) + '\n\nFIN DEL HISTORIAL DE PRUEBA',
    }))),
  },
  'composer-file-drag': {
    title: 'Composer: arrastrar archivos a todo el chat',
    phases: ['exercise'],
    model: () => startFakeModel([{ text: 'Adjunto recibido en el turno de prueba.' }]),
    fixtures: (data) => {
      writeFileSync(join(data, 'adjunto.txt'), 'Contenido de prueba del flujo de adjuntos.')
      writeFileSync(join(data, 'imagen.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'))
    },
  },
  'project-reveal': {
    title: 'Barra lateral: desplegar el proyecto al crear',
    phases: ['exercise', 'restart'],
  },
  'session-menu-id': {
    title: 'Barra lateral: ID de sesión en una línea',
    phases: ['exercise'],
  },
}

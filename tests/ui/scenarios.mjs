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
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { scriptedModel, startFakeModel, startRoutedModel } from '../../scripts/fake-model.mjs'

const paragraphs = (count, line) => Array.from({ length: count }, (_, i) => line(i + 1)).join('\n\n')

/** Texto de un mensaje de la API de chat (cadena o partes). */
const contentText = (content) => typeof content === 'string' ? content : Array.isArray(content) ? content.map((part) => part?.text ?? '').join('') : ''
/** Carril de cada petición: el título de la conversación, un subagente o el coordinador. */
function laneOf(body) {
  const messages = body.messages ?? []
  if (contentText(messages[0]?.content).includes('concise conversation title')) return 'title'
  if (messages.some((m) => m.role === 'user' && contentText(m.content).includes('OBJETIVO-SUB'))) return 'sub'
  return 'main'
}

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
  dictation: {
    title: 'Dictado: micrófono del composer con whisper.cpp local (real con RINARI_E2E_WHISPER_DIR)',
    phases: ['exercise'],
    // The model goes where the Engine looks: <RINARI_HOME>/models/speech.
    fixtures: (data) => {
      const dir = process.env.RINARI_E2E_WHISPER_DIR
      if (!dir || !existsSync(join(dir, 'ggml-small-q5_1.bin'))) return
      mkdirSync(join(data, 'engine', 'models', 'speech'), { recursive: true })
      copyFileSync(join(dir, 'ggml-small-q5_1.bin'), join(data, 'engine', 'models', 'speech', 'ggml-small-q5_1.bin'))
    },
    model: () => startFakeModel(Array.from({ length: 6 }, () => ({ text: 'DICTADO RECIBIDO' }))),
  },
  'skill-manager': {
    title: 'Gestor de skills: lección desde el turno, freno de duplicados con motivo y fusión preparada',
    phases: ['exercise'],
    model: () => startRoutedModel({
      title: Array.from({ length: 6 }, () => ({ text: 'Notas de versión' })),
      main: [
        { tool: 'fs.list', args: { path: '.' }, say: 'Miro la carpeta.' },
        { text: 'LISTO UNO' },
        { tool: 'skills.propose', args: { name: 'release-notes', skill_md: "---\nname: release-notes\ndescription: Write the release notes from the changelog: group by feature, fix and breaking change, link each PR.\nversion: 1.0.0\nrisk: low\nrequired_tools:\n  - fs.read\n---\n\n# Procedure\n1. Read CHANGELOG.md since the last tag.\n2. Group entries by feature, fix and breaking change.\n3. Link each PR number.\n\n## Lecciones\n- Breaking changes go first.\n" }, say: 'Guardo la lección.' },
        { text: 'LECCION GUARDADA' },
        { tool: 'skills.propose', args: { name: 'release-notes-draft', skill_md: "---\nname: release-notes-draft\ndescription: Draft the release notes from the changelog: group by feature, fix and breaking change with PR links.\nversion: 1.0.0\nrisk: low\nrequired_tools:\n  - fs.read\n---\n\n# Procedure\n1. Read CHANGELOG.md since the last tag.\n2. Group by feature, fix and breaking change.\n3. Add the PR links.\n" }, say: 'Propongo la skill.' },
        { tool: 'skills.propose', args: { name: 'release-notes-draft', skill_md: "---\nname: release-notes-draft\ndescription: Draft the release notes from the changelog: group by feature, fix and breaking change with PR links.\nversion: 1.0.0\nrisk: low\nrequired_tools:\n  - fs.read\n---\n\n# Procedure\n1. Read CHANGELOG.md since the last tag.\n2. Group by feature, fix and breaking change.\n3. Add the PR links.\n", distinct_from: { 'release-notes': 'only drafts for review, never publishes the final notes' } }, say: 'Es otra tarea.' },
        { text: 'LISTO TRES' },
      ],
    }, laneOf),
  },
  'memory-proposal': {
    title: 'Memoria visible: propuesta en el chat, Ajustes > Memoria y modo automático con Deshacer',
    phases: ['exercise'],
    model: () => startRoutedModel({
      title: Array.from({ length: 6 }, () => ({ text: 'Memoria del entorno' })),
      main: [
        { tool: 'memory.propose', args: { text: 'El servidor de pruebas escucha en 127.0.0.1:8080', topic: 'Servidor de pruebas', kind: 'environment' }, say: 'Lo anoto.' },
        { text: 'LISTO UNO' },
        { tool: 'memory.propose', args: { text: 'La app de ejemplo se arranca con npm run dev', topic: 'Arranque de la app', kind: 'workflow' }, say: 'Lo anoto.' },
        { text: 'LISTO DOS' },
      ],
    }, laneOf),
  },
  'activity-text-shimmer': {
    title: 'Brillo del texto de actividad: ejecución, grupos, finalización y movimiento reducido',
    phases: ['exercise'],
    model: () => startRoutedModel({
      title: [{ text: 'Animación de actividad' }],
      main: [
        { tool: 'fs.glob', args: { pattern: '*.txt' }, say: 'Voy a ejecutar una comprobación local.' },
        { tool: 'shell.exec', args: { argv: ['python', '-c', "import time; print('Actividad local', flush=True); time.sleep(25); print('Listo', flush=True)"], timeout_s: 40 }, say: '' },
        { text: 'ACTIVIDAD TERMINADA. La respuesta queda sin animación.' },
        { text: 'RESPUESTA CANCELADA' },
        { tool: 'fs.glob', args: { pattern: '*.txt' }, say: 'Puedes abrir el grupo para ver los detalles. El brillo indica que sigo trabajando.' },
        { tool: 'shell.exec', args: { argv: ['python', '-c', "import time; print('Demostración de actividad', flush=True); time.sleep(120); print('Demostración terminada', flush=True)"], timeout_s: 150 }, say: '' },
        { text: 'Demostración terminada.' },
      ],
    }, laneOf, { held: ['main'] }),
  },
  'diagnostics-export': {
    title: 'Acerca de: exportar diagnóstico con registros, volcados y resumen del Engine, sin contenido',
    phases: ['exercise'],
    model: () => startFakeModel([{ text: 'DIAGNÓSTICO' }]),
  },
  'claude-subscription-toggle': {
    title: 'Claude Subscription opt-in: interruptor en Ajustes > Proveedores, apagado por defecto',
    phases: ['exercise'],
    model: () => startFakeModel([{ text: 'SIN USO' }]),
  },
  'provider-logos': {
    title: 'Logos oficiales: catálogo, configuración, modelos, Normal, Boards y Flujos',
    phases: ['exercise'],
    model: () => startFakeModel(Array.from({ length: 30 }, () => ({ text: 'LOGOS LISTOS. Respuesta local sin consultas a proveedores externos.' }))),
  },
  'chat-interaction-fixes': {
    title: 'Chat: plegado sin flecha residual, checkpoints, sidebar y Enviar/Stop',
    phases: ['exercise'],
    model: () => startRoutedModel({
      title: [{ text: 'Prueba de interacción' }],
      main: [
        ...Array.from({ length: 12 }, (_, i) => ({ tool: 'fs.glob', args: { pattern: `revision-${i}-*.txt` }, say: i === 0 ? 'Reviso la carpeta local.' : '' })),
        { text: 'REVISIÓN TERMINADA' },
        { text: 'MENSAJE RECIBIDO' },
        { text: 'NO DEBE APARECER TRAS DETENER' },
      ],
    }, laneOf, { held: ['main'] }),
  },
  'tray-menu-titlebar': {
    title: 'Acciones de la bandeja con ventana oculta y barra superior sin contador de ejecuciones',
    phases: ['exercise'],
    model: () => heldModel([{ text: 'PRUEBA DE BANDEJA TERMINADA' }]),
  },
  'activity-disclosure': {
    title: 'Avances visibles, operaciones plegadas y resumen al terminar en Normal y Boards',
    phases: ['exercise'],
    model: () => startRoutedModel({
      title: [{ text: 'Actividad de prueba' }],
      main: [
        ...Array.from({ length: 24 }, (_, i) => ({ tool: 'fs.glob', args: { pattern: `actividad-${i}-*.txt` }, say: `PROGRESO ${i + 1}.\n\n` + paragraphs(10, n => `Detalle ${n} del paso ${i + 1}: revisión local de la actividad y conservación de lectura.`) })),
        { text: 'RESULTADO COMPLETO\n\n' + paragraphs(35, n => `Párrafo final ${n}: la respuesta sigue completa y fuera del bloque de actividad.`) },
        { httpError: { status: 400, body: { error: { message: 'Fallo controlado del proveedor local', type: 'invalid_request_error' } } } },
        { text: 'RESPUESTA PARA EL PANEL VECINO' },
        { text: 'ESTA RESPUESTA CANCELADA NO DEBE APARECER' },
        ...Array.from({ length: 10 }, (_, i) => [
          { tool: 'fs.glob', args: { pattern: `prueba-${i}-*.txt` }, say: 'Voy a revisar la carpeta para que puedas probar la actividad plegable.' },
          { text: 'Prueba terminada. Puedes abrir la actividad, cambiar entre Normal y Boards o enviar otro mensaje.' },
        ]).flat(),
      ],
    }, laneOf, { held: ['main'] }),
  },
  'attention-taskbar': {
    title: 'Pendientes: un resultado en otro chat de Normal sube el número',
    phases: ['exercise'],
    model: () => heldModel([{ text: 'Listo, ya revisé el informe.' }]),
  },
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
  'chat-send-jump': {
    title: 'Chat: enviar desde arriba lleva al final',
    phases: ['exercise'],
    model: () => startFakeModel([1, 2, 3, 4].map((n) => ({
      text: paragraphs(60, (i) => `Párrafo ${i} del turno ${n}: historial para comprobar el salto al enviar.`) + (n % 2 ? `\n\nFIN DEL HISTORIAL ${n}` : `\n\nRESPUESTA AL ENVÍO ${n}`),
    }))),
  },
  'conversation-draft': {
    title: 'Conversación nueva: borrador hasta el primer mensaje',
    phases: ['exercise'],
    // Las sesiones nacen como «Nueva conversación»: el título va por su carril.
    model: () => startRoutedModel({
      title: [{ text: 'Plan del proyecto' }, { text: 'Saludo del panel' }],
      main: [{ text: 'RESPUESTA DEL BORRADOR' }, { text: 'RESPUESTA DEL PANEL' }],
    }, laneOf),
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
  'document-sheet': {
    title: 'Documentos: un XLSX del workspace se ve como cuadrícula, con fórmulas pendientes honestas',
    phases: ['exercise'],
    model: () => startFakeModel([{ text: 'Lista: [Presupuesto](out/presupuesto.xlsx)' }]),
  },
  'document-preview': {
    title: 'Documentos: un PPTX del workspace se ve renderizado, con su contenido',
    phases: ['exercise'],
    model: () => startFakeModel([{ text: 'Lista: [Ventas](out/ventas.pptx)' }]),
  },
  'file-media': {
    title: 'Archivos: video, imagen, PDF y audio del workspace',
    phases: ['exercise'],
    model: () => startFakeModel([{ text: 'Listo: [Ver la promo](out/clip.mp4) · [Póster](out/poster.png) · [Manual](out/manual.pdf) · [Voz](out/voz.mp3)' }]),
  },
  'model-change-notice': {
    title: 'Chat: aviso de cambio de modelo',
    phases: ['exercise', 'restart'],
    model: () => startFakeModel([{ text: 'RESPUESTA UNO' }, { text: 'RESPUESTA DOS' }, { text: 'RESPUESTA TRES' }]),
  },
  'provider-limit': {
    title: 'Errores: cuota agotada lleva a Uso y límites del proveedor',
    phases: ['exercise'],
    model: () => startFakeModel([{ httpError: { status: 429, body: { error: { message: 'You exceeded your current quota, please check your plan and billing details.', type: 'insufficient_quota', code: 'insufficient_quota' } } } }]),
  },
  'project-reveal': {
    title: 'Barra lateral: desplegar el proyecto al crear',
    phases: ['exercise', 'restart'],
  },
  'session-menu-id': {
    title: 'Barra lateral: ID de sesión en una línea',
    phases: ['exercise'],
  },
  'session-title': {
    title: 'Barra lateral: título que resume el primer mensaje',
    phases: ['exercise'],
    model: () => startRoutedModel({
      title: [{ text: 'Poema francés sobre los huskies' }],
      main: [{ text: 'Les huskies sont de merveilleux chiens…' }],
    }, laneOf, { held: ['main'] }),
  },
  'subagent-follow': {
    title: 'Actividad de subagente: seguir el final',
    phases: ['exercise'],
    model: () => startRoutedModel({
      main: [
        { tool: 'agent.spawn', args: { agent: 'explore', objective: 'OBJETIVO-SUB: revisa la carpeta' }, say: 'Voy a pedir a un explorador que revise la carpeta.' },
        { tool: 'agent.wait', args: { agent_id: 'agt_001', timeout_s: 300 }, say: '' },
        { text: 'FIN DEL COORDINADOR' },
      ],
      sub: [
        // Pasos distintos: repetir la misma llamada activaría el detector de bucles.
        ...['*', '*.txt', '*.md', '*.json', '**/*'].map((pattern, i) => ({ tool: 'fs.glob', args: { pattern }, say: `Paso ${i + 1} del subagente.\n\n` + paragraphs(12, (line) => `Línea ${line} del paso ${i + 1}: actividad larga del subagente para desbordar la tarjeta.`) })),
        { text: 'RESUMEN DEL SUBAGENTE' },
      ],
    }, laneOf, { held: ['sub'] }),
  },
  'ui-tour': {
    title: 'Recorrido visual: capturas de las superficies principales para revisar el diseño',
    phases: ['exercise'],
    fixtures: (data) => {
      writeFileSync(join(data, 'notas.md'), '# Notas\n\nArchivo de ejemplo para el recorrido.\n')
      writeFileSync(join(data, 'datos.json'), JSON.stringify({ ok: true, items: [1, 2, 3] }, null, 2))
    },
    model: () => startRoutedModel({
      title: [{ text: 'Recorrido visual' }],
      main: [
        { tool: 'fs.list', args: { path: '.' }, say: 'Voy a mirar la carpeta primero.' },
        { tool: 'fs.glob', args: { pattern: '*.md' }, say: 'Busco las notas.' },
        { tool: 'agent.spawn', args: { agent: 'explore', objective: 'OBJETIVO-SUB: revisa la carpeta' }, say: 'Le pido a un explorador que revise el resto.' },
        { tool: 'agent.wait', args: { agent_id: 'agt_001', timeout_s: 300 }, say: '' },
        { text: '## Resumen\n\nRevisé la carpeta. Hay **dos archivos**:\n\n| Archivo | Tipo |\n|---|---|\n| notas.md | Markdown |\n| datos.json | JSON |\n\n```ts\nexport function suma(a: number, b: number) {\n  return a + b\n}\n```\n\n- Todo está en orden.\n- No cambié nada.\n\nFIN DEL RECORRIDO' },
        { tool: 'fs.glob', args: { pattern: '*.json' }, say: 'Sigo revisando.' },
        { text: 'TRABAJO TERMINADO' },
      ],
      sub: [
        ...['*', '*.json', '**/*'].map((pattern, i) => ({ tool: 'fs.glob', args: { pattern }, say: `Paso ${i + 1} del explorador.` })),
        { text: 'El explorador no encontró nada más.' },
      ],
    }, laneOf, { held: ['main', 'sub'] }),
  },
}

/**
 * Página de prueba local determinista (documento 03 §3).
 *
 * Servida por un servidor efímero en 127.0.0.1 con puerto asignado por el
 * sistema. Sin credenciales, sin recursos externos, sin red: todo lo que la
 * página necesita está escrito aquí. Es lo que permite afirmar que un píxel
 * rojo en una captura viene de esta página y no de otra cosa.
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

/** Colores planos e inconfundibles: el recorte se mide contándolos. */
export const SLOT_COLOR = { r: 220, g: 30, b: 40 } as const
export const BACKDROP_COLOR = { r: 20, g: 60, b: 220 } as const

function rgb(color: { r: number; g: number; b: number }): string {
  return `rgb(${color.r}, ${color.g}, ${color.b})`
}

/**
 * La página del slot: fondo plano, un campo y un botón que muta el DOM.
 *
 * El botón no hace nada asíncrono ni depende de temporizadores: si el estado
 * cambió, fue por el click, no por el paso del tiempo.
 */
const SLOT_PAGE = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>fixture-slot</title>
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: ${rgb(SLOT_COLOR)}; }
  body { font: 16px system-ui, sans-serif; color: #fff; }
  #panel { padding: 24px; }
  input, button { font-size: 16px; padding: 6px 10px; }
</style>
</head>
<body>
  <div id="panel">
    <input id="field" name="field" type="text" value="">
    <button id="go" type="button">Aplicar</button>
    <p id="result" data-state="pending">sin aplicar</p>
    <p id="viewport"></p>
  </div>
<script>
  // Registro de entradas recibidas: distingue lo que llegó a la página de lo
  // que solo se despachó. El arbitraje del §7 se mide con esto.
  window.__probe = { clicks: 0, keys: 0, wheels: 0, lastClick: null };
  document.addEventListener('click', function (event) {
    window.__probe.clicks += 1;
    window.__probe.lastClick = { x: event.clientX, y: event.clientY };
  }, true);
  document.addEventListener('keydown', function () { window.__probe.keys += 1; }, true);
  document.addEventListener('wheel', function () { window.__probe.wheels += 1; }, true);

  document.getElementById('go').addEventListener('click', function () {
    var value = document.getElementById('field').value;
    var result = document.getElementById('result');
    result.textContent = 'aplicado: ' + value;
    result.setAttribute('data-state', 'applied');
  });

  function reportViewport() {
    document.getElementById('viewport').textContent =
      window.innerWidth + 'x' + window.innerHeight + ' @' + window.devicePixelRatio;
  }
  reportViewport();
  window.addEventListener('resize', reportViewport);
</script>
</body>
</html>`

/** Fondo plano para que el área no cubierta por el slot sea medible. */
const BACKDROP_PAGE = `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><title>fixture-backdrop</title>
<style>html,body{margin:0;padding:0;height:100%;background:${rgb(BACKDROP_COLOR)};}</style>
</head><body></body></html>`

export interface Fixture {
  origin: string
  slotUrl: string
  backdropUrl: string
  close(): Promise<void>
}

/**
 * Levanta el fixture en un puerto efímero de loopback.
 *
 * El puerto lo asigna el sistema: nada en la prueba depende de un número
 * concreto, y dos ejecuciones simultáneas no se pisan.
 */
export async function startFixture(): Promise<Fixture> {
  const server: Server = createServer((request, response) => {
    const path = (request.url ?? '/').split('?')[0]
    const body = path === '/backdrop' ? BACKDROP_PAGE : SLOT_PAGE
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      // Sin caché: cada navegación de la prueba lee la página servida ahora.
      'Cache-Control': 'no-store',
    })
    response.end(body)
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const { port } = server.address() as AddressInfo
  const origin = `http://127.0.0.1:${port}`
  return {
    origin,
    slotUrl: `${origin}/slot`,
    backdropUrl: `${origin}/backdrop`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
      }),
  }
}

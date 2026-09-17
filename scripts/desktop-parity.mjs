#!/usr/bin/env node
// Inventario de paridad desktop (documento 02 §2, entrega C).
//
// Cruza los handlers `#[tauri::command]` del host Rust con los sitios de
// llamada `invoke(...)` del frontend y con las APIs de `@tauri-apps/*` que se
// usan directamente, y escribe docs/migration/desktop-parity.{json,md}.
//
//   node scripts/desktop-parity.mjs            regenera
//   node scripts/desktop-parity.mjs --check    falla si el inventario cambió
//
// No inventa entradas: lo que no está en el código no está en el inventario, y
// un comando registrado sin llamador se marca para decidirlo a propósito.

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CHECK = process.argv.includes('--check')
const OUT_DIR = join(ROOT, 'docs', 'migration')

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}

const rel = (path) => relative(ROOT, path).replaceAll('\\', '/')

// -- host Rust ---------------------------------------------------------------

/** Comandos que `main.rs` expone realmente al WebView. */
function registered() {
  const text = readFileSync(join(ROOT, 'src-tauri/src/main.rs'), 'utf8')
  const block = text.split('invoke_handler(tauri::generate_handler![')[1].split('])')[0]
  return block
    .split('\n')
    .map((line) => line.trim().replace(/,$/, ''))
    .filter(Boolean)
    .map((line) => line.split('::').pop())
}

// Argumentos que aporta Tauri, no el llamador.
const HOST_ARGS = ['State<', 'AppHandle', 'Window', 'WebviewWindow', 'tauri::']
// Efectos que no pasan por el Engine.
const EFFECTS = [
  ['opener()', 'abre ruta/URL con el opener del sistema'],
  ['dialog()', 'diálogo nativo'],
  ['emit(', 'emite evento al frontend'],
  ['set_focus', 'foco de ventana'],
]

/** Separa argumentos respetando genéricos anidados (`Option<Vec<String>>`). */
function splitArgs(raw) {
  const parts = []
  let depth = 0
  let current = ''
  for (const char of raw) {
    if ('<(['.includes(char)) depth += 1
    else if ('>)]'.includes(char)) depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else current += char
  }
  parts.push(current)
  return parts
    .map((part) => part.trim())
    .filter((part) => part && !HOST_ARGS.some((token) => part.includes(token)))
    .map((part) => {
      const at = part.indexOf(':')
      const type = part.slice(at + 1).trim()
      return { name: part.slice(0, at).trim(), type, optional: type.startsWith('Option<') }
    })
}

/**
 * Wrappers tipados de `EngineSupervisor`: `session_get` → `SessionGet` con
 * `{"ref": …}`.
 *
 * La mayoría de los comandos no llevan el `Method::` en su cuerpo: delegan en
 * uno de estos, que además **renombra** los argumentos (`reference` viaja como
 * `ref`). Sin resolverlo, el inventario diría «—» en 95 de 130 filas y el host
 * nuevo se construiría contra una traducción que no existe.
 */
function supervisorWrappers() {
  const text = readFileSync(join(ROOT, 'src-tauri/src/engine/supervisor.rs'), 'utf8')
  const wrappers = new Map()
  // Se trocea por función en vez de casar firma y cuerpo con un regex: uno
  // no anclado puede empezar en una función y terminar en el `->` de otra,
  // y entonces cada wrapper hereda el método del siguiente.
  const chunks = text.split(/\n    pub fn /).slice(1)
  for (const chunk of chunks) {
    const name = /^(\w+)/.exec(chunk)?.[1]
    if (!name) continue
    const open = chunk.indexOf('(')
    const close = chunk.indexOf(') -> ', open)
    if (open === -1 || close === -1) continue
    const rawArgs = chunk.slice(open + 1, close)
    const body = chunk.slice(close)
    const method = /Method::(\w+)/.exec(body)?.[1]
    if (!method) continue
    // Claves con las que el wrapper arma los parámetros del protocolo.
    const payload = /json!\(\{([\s\S]*?)\}\)/.exec(body)?.[1] ?? ''
    const keys = [...payload.matchAll(/"([^"]+)"\s*:/g)].map((entry) => entry[1])
    wrappers.set(name, {
      method,
      params: keys,
      args: splitArgs(rawArgs.replace(/&self\s*,?/, '')).map((arg) => arg.name),
    })
  }
  return wrappers
}

/**
 * `Method::SessionGet` → `"session.get"`.
 *
 * El nombre de la variante Rust no es el método del protocolo. El host nuevo
 * habla con el Engine por la cadena, así que sin este mapa la traducción
 * estaría a medias.
 */
function methodNames() {
  const text = readFileSync(join(ROOT, 'src-tauri/src/engine/protocol_generated.rs'), 'utf8')
  const names = new Map()
  for (const entry of text.matchAll(/^\s*(\w+)\s*=>\s*"([^"]+)",/gm)) {
    names.set(entry[1], entry[2])
  }
  return names
}

function handlers() {
  const wrappers = supervisorWrappers()
  const names = methodNames()
  const found = new Map()
  const dir = join(ROOT, 'src-tauri/src/commands')
  for (const path of readdirSync(dir).filter((name) => name.endsWith('.rs')).sort()) {
    const text = readFileSync(join(dir, path), 'utf8')
    // Se trocea por atributo: un cuerpo acotado «por caracteres» se mete en la
    // función siguiente y le roba su `Method::`, que es justo el dato que este
    // inventario existe para dar bien.
    const pieces = text.split(/#\[tauri::command/).slice(1)
    for (const piece of pieces) {
      const attrEnd = piece.indexOf(']')
      const match = [null, piece.slice(0, attrEnd)]
      const sig = /pub(?:\(crate\))?\s+(async\s+)?fn\s+(\w+)\s*\(([\s\S]*?)\)\s*(?:->\s*([\s\S]+?))?\s*\{/.exec(
        piece,
      )
      if (!sig) continue
      const body = piece.slice(sig.index + sig[0].length)
      // Directo, o resuelto por el wrapper del supervisor al que delega.
      const direct = /Method::(\w+)/.exec(body)?.[1] ?? null
      const delegated = [...body.matchAll(/engine\.(\w+)\s*\(/g)]
        .map((entry) => wrappers.get(entry[1]))
        .find(Boolean)
      found.set(sig[2], {
        command: sig[2],
        module: path.replace(/\.rs$/, ''),
        async: Boolean(sig[1]),
        rename_all: match[1]?.includes('snake_case') ? 'snake_case' : 'camelCase (por defecto)',
        args: splitArgs(sig[3]),
        returns: (sig[4] ?? '()').trim(),
        engine_method: direct ?? delegated?.method ?? null,
        /** El método tal como viaja por el protocolo, no la variante Rust. */
        engine_method_name: names.get(direct ?? delegated?.method ?? '') ?? null,
        /** Claves con las que el parámetro llega al Engine; renombra. */
        engine_params: delegated?.params ?? null,
        host_effects: EFFECTS.filter(([token]) => body.includes(token)).map(([, label]) => label),
      })
    }
  }
  return found
}

// -- frontend ----------------------------------------------------------------

/**
 * Nombres de comando en `platform().command(...)` y en `invoke(...)`.
 *
 * Los consumidores pasan por el adaptador (`command`); `invoke` solo queda
 * dentro de `src/platform/tauri.ts`, pero se sigue reconociendo para que el
 * inventario no mienta si alguien lo reintroduce.
 *
 * Un regex no basta: el parámetro de tipo anida `<>` (`Record<string, number>`)
 * y puede contener paréntesis (`import('...').VisionSettings`). Se recorre el
 * texto saltando el genérico con un contador de corchetes angulares.
 */
export function invokedNames(text) {
  return [...scanCalls(text, 'invoke', false), ...scanCalls(text, 'command', true)]
}

function scanCalls(text, token, afterDot) {
  const names = []
  let index = 0
  while ((index = text.indexOf(token, index)) !== -1) {
    let cursor = index + token.length
    const before = index > 0 ? text[index - 1] : ' '
    // `command` es método (`.command(`); `invoke` es función suelta.
    if (afterDot ? before !== '.' : /[\w$.]/.test(before)) {
      index = cursor
      continue
    }
    while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1
    if (text[cursor] === '<') {
      let depth = 0
      while (cursor < text.length) {
        if (text[cursor] === '<') depth += 1
        else if (text[cursor] === '>' && --depth === 0) {
          cursor += 1
          break
        }
        cursor += 1
      }
      while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1
    }
    if (text[cursor] === '(') {
      const name = /^\s*['"]([a-z0-9_]+)['"]/.exec(text.slice(cursor + 1, cursor + 200))
      if (name) names.push(name[1])
    }
    index = cursor
  }
  return names
}

function frontendFiles() {
  return walk(join(ROOT, 'src')).filter((path) => /\.tsx?$/.test(path))
}

function callers() {
  const calls = new Map()
  for (const path of frontendFiles()) {
    if (path.includes('.test.')) continue
    for (const name of invokedNames(readFileSync(path, 'utf8'))) {
      if (!calls.has(name)) calls.set(name, new Set())
      calls.get(name).add(rel(path))
    }
  }
  return calls
}

/** Uso directo de `@tauri-apps/*`: ventana, diálogos, opener, menú, updater. */
function platformApis() {
  const surface = new Map()
  const pattern = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"](@tauri-apps\/[^'"]+)['"]/g
  for (const path of frontendFiles()) {
    const text = readFileSync(path, 'utf8')
    let match
    while ((match = pattern.exec(text))) {
      const module = match[2]
      if (!surface.has(module)) surface.set(module, new Map())
      for (const raw of match[1].split(',')) {
        const name = raw.trim().split(' as ')[0].trim()
        if (!name) continue
        if (!surface.get(module).has(name)) surface.get(module).set(name, new Set())
        surface.get(module).get(name).add(rel(path))
      }
    }
  }
  const out = {}
  for (const module of [...surface.keys()].sort()) {
    out[module] = {}
    for (const name of [...surface.get(module).keys()].sort()) {
      out[module][name] = [...surface.get(module).get(name)].sort()
    }
  }
  return out
}

// -- informe -----------------------------------------------------------------

function build() {
  const found = handlers()
  const listed = registered()
  const used = callers()

  const commands = listed.map((name) => ({
    ...(found.get(name) ?? { command: name, module: '?', args: [] }),
    registered: true,
    callers: [...(used.get(name) ?? [])].sort(),
  }))

  return {
    registered_commands: listed.length,
    handlers_found: found.size,
    commands,
    handlers_not_registered: [...found.keys()].filter((name) => !listed.includes(name)).sort(),
    registered_without_frontend_caller: commands.filter((row) => !row.callers.length).map((row) => row.command),
    invoked_but_not_registered: [...used.keys()].filter((name) => !listed.includes(name)).sort(),
    platform_apis: platformApis(),
    frontend_events: ['rinari-engine-event', 'rinari-menu-action', 'rinari-open-request'],
  }
}

// supervisor.rs elige el plazo por método; transport.rs fija el del handshake.
const TEN_SECONDS = `SessionList SessionGet SessionCreate SessionOpen SessionRename
  SessionArchive SessionRestore SessionFork SessionClose SessionHistory`.split(/\s+/)
const DEADLINES = new Map([
  ['ProjectStatus', '5 s'],
  ['SessionTurnStart', '5 s'],
  ['ModelDiscoveryStart', '5 s'],
  ...TEN_SECONDS.map((name) => [name, '10 s']),
])

const MODULE_TITLE = {
  engine: 'Ciclo de vida del Engine',
  sessions: 'Sesiones y turnos',
  peers: 'Mensajería entre paneles',
  workspace: 'Workspace, contexto y adjuntos',
  desktop: 'Superficies desktop del Engine',
  projects: 'Proyectos',
  providers: 'Proveedores',
  models: 'Modelos',
  agents: 'Agentes',
  souls: 'Souls',
  ecosystem: 'MCP, plugins, herramientas y políticas',
  workflow: 'Bundles',
}
const MODULE_ORDER = Object.keys(MODULE_TITLE)

const short = (path) => `\`${path.replace(/^src\//, '')}\``

function render(data) {
  const out = []
  const add = (line = '') => out.push(line)
  const deadline = (row) => (row.engine_method ? (DEADLINES.get(row.engine_method) ?? '60 s') : '—')
  const args = (row) =>
    row.args?.length
      ? row.args.map((a) => `\`${a.name}\`: \`${a.type}\`${a.optional ? ' *(opcional)*' : ''}`).join('<br>')
      : '—'
  const who = (row) => (row.callers?.length ? row.callers.map(short).join('<br>') : '**ninguno**')

  add('# Inventario de paridad desktop')
  add()
  add('**Documento 02 §2 — entrega C.** Archivo **generado** por')
  add('`npm run parity:inventory` a partir del código y comprobado en CI con')
  add('`npm run parity:check`. No editar a mano: si un comando aparece o cambia de')
  add('firma sin regenerar, la comprobación falla.')
  add()
  add('Su objeto es que el host Electron (documento 02 §3, entrega D) tenga la lista')
  add('completa de lo que debe seguir existiendo, con argumentos, plazo y efectos. El')
  add('documento 02 §2 avisa de que **la allowlist no puede derivarse solo de los')
  add('métodos del Engine**: hay operaciones de ventana que no pertenecen al protocolo.')
  add('Por eso el inventario tiene dos mitades: los comandos y las APIs de plataforma')
  add('que el frontend usa directamente.')
  add()
  add('## Resumen')
  add()
  add('| Superficie | Cantidad |')
  add('|---|---|')
  add(`| Comandos registrados en \`invoke_handler\` | **${data.registered_commands}** |`)
  add(`| Handlers \`#[tauri::command]\` hallados | ${data.handlers_found} |`)
  add(`| Handlers sin registrar | ${data.handlers_not_registered.length} |`)
  add(`| Invocados desde el frontend sin registrar | ${data.invoked_but_not_registered.length} |`)
  add(`| Registrados sin ningún llamador en \`src/\` | ${data.registered_without_frontend_caller.length} |`)
  add(`| Eventos del host hacia el frontend | ${data.frontend_events.length} |`)
  add()

  if (data.registered_without_frontend_caller.length) {
    add('### Registrados sin llamador')
    add()
    add('Expuestos al WebView pero que ningún archivo de `src/` invoca. No se portan al')
    add('host nuevo sin una decisión explícita: cada uno es superficie que nadie usa.')
    add()
    for (const name of data.registered_without_frontend_caller) add(`- \`${name}\``)
    add()
  }

  add('## Plazos')
  add()
  add('`EngineSupervisor::request` elige el plazo por método y `EngineTransport` fija el')
  add('del handshake. El documento 02 §4.2 pide conservar esta diferenciación y **no**')
  add('asignar 60 s a toda acción:')
  add()
  add('| Ámbito | Plazo |')
  add('|---|---|')
  add('| Handshake (`hello`) | 15 s |')
  add('| `project.status` | 5 s |')
  add('| `session.turn.start`, `model.discovery.start` | 5 s |')
  add('| Lista/lectura/ciclo de vida de sesiones | 10 s |')
  add('| Resto de métodos | 60 s |')
  add()
  add('## Eventos del host hacia el frontend')
  add()
  add('| Evento | Origen | Contenido | Quién escucha |')
  add('|---|---|---|---|')
  add('| `rinari-engine-event` | `commands/engine.rs`, sink del supervisor | **Todos** los eventos asíncronos del Engine, por un único canal | `services/engine.ts` |')
  add('| `rinari-menu-action` | `menu.rs` | Id de la acción del menú nativo | `services/actions.ts` |')
  add('| `rinari-open-request` | `main.rs`, plugin single-instance | Handoff `rinari desktop [ruta] [--session id]` de una segunda instancia | `App.tsx` |')
  add()
  add('Un único canal para todos los eventos del Engine es un detalle a conservar: el')
  add('host nuevo no debe abrir un lector por panel (documento 02 §4.2).')
  add()
  add('El arranque en frío no usa evento sino el comando `initial_open_request`, que lee')
  add('`std::env::args()`. El host nuevo necesita los dos caminos: argumentos del proceso')
  add('propio y entrega de la segunda instancia.')
  add()
  add('## APIs de plataforma usadas directamente')
  add()
  add('Lo que el frontend importa de `@tauri-apps/*` sin pasar por `invoke`. Es la parte')
  add('que un inventario hecho solo con métodos del Engine se dejaría fuera.')
  add()
  add('| Módulo | Símbolo | Archivos |')
  add('|---|---|---|')
  for (const [module, names] of Object.entries(data.platform_apis)) {
    for (const [name, paths] of Object.entries(names)) {
      const shown = paths.slice(0, 6).map(short).join('<br>')
      const extra = paths.length > 6 ? `<br>… y ${paths.length - 6} más` : ''
      add(`| \`${module}\` | \`${name}\` | ${shown}${extra} |`)
    }
  }
  add()
  add('## Comandos')
  add()
  add('`rename_all` indica cómo viajan los nombres de argumento por el puente: la')
  add('mayoría usa `snake_case` explícito y el host nuevo debe respetar exactamente el')
  add('mismo contrato, o las llamadas fallan en silencio.')
  add()
  add('**El nombre del comando no es el método del protocolo.** `session_get` habla')
  add('con `session.get`, y sus argumentos se renombran por el camino: el renderer')
  add('envía `reference` y el Engine recibe `ref`. El host anterior hacía esa')
  add('traducción en 130 handlers Rust; el nuevo la necesita igual, y esta tabla es su')
  add('especificación. La columna «Método del Engine» es la cadena real, no la')
  add('variante del enum.')
  add()

  const byModule = new Map()
  for (const row of data.commands) {
    const module = row.module ?? '?'
    if (!byModule.has(module)) byModule.set(module, [])
    byModule.get(module).push(row)
  }
  const order = [...byModule.keys()].sort((a, b) => {
    const ia = MODULE_ORDER.indexOf(a)
    const ib = MODULE_ORDER.indexOf(b)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b)
  })
  for (const module of order) {
    const rows = byModule.get(module).sort((a, b) => a.command.localeCompare(b.command))
    add(`### ${MODULE_TITLE[module] ?? module} — \`commands/${module}.rs\` (${rows.length})`)
    add()
    add('| Comando | Argumentos | Método del Engine | Plazo | Devuelve | Efectos de host | Llamado desde |')
    add('|---|---|---|---|---|---|---|')
    for (const row of rows) {
      // La cadena del protocolo, que es con lo que habla el host nuevo.
      const method = row.engine_method_name ? `\`${row.engine_method_name}\`` : '—'
      const effects = row.host_effects?.length ? row.host_effects.join('<br>') : '—'
      add(
        `| \`${row.command}\` | ${args(row)} | ${method} | ${deadline(row)} | ` +
          `\`${row.returns ?? '?'}\` | ${effects} | ${who(row)} |`,
      )
    }
    add()
  }

  add('## Qué falta para declarar paridad')
  add()
  add('Este inventario dice **qué** existe, no que el host nuevo lo cubra. El documento')
  add('02 §8 cierra la fase cuando cada fila tenga correspondencia y prueba en el host')
  add('Electron, o un bloqueo explícito que impida declarar paridad. Las columnas de')
  add('errores y prueba de paridad se añaden en la entrega D, cuando exista el destino')
  add('contra el que compararse.')
  add()
  return out.join('\n')
}

/**
 * Union cerrada de nombres de comando para `src/platform/contract.ts`.
 *
 * El contrato de plataforma sale del inventario, no de una lista escrita a
 * mano: un comando nuevo sin regenerar no compila en el adaptador. En tiempo
 * de ejecución no basta —el documento 02 §3.1 recuerda que TypeScript no
 * sustituye la validación— y esa allowlist vive en el main de Electron
 * (entrega D).
 */
function renderCommandUnion(data) {
  const names = data.commands.map((row) => row.command).sort()
  return [
    '// Generado por `npm run parity:inventory`. No editar a mano.',
    '// Documento 02 §3.1: la lista de comandos del host es cerrada y sale del',
    '// inventario de paridad, para que no pueda divergir del código del host.',
    '',
    '/** Comandos que el host expone al renderer. */',
    'export type DesktopCommand =',
    ...names.map((name) => `  | '${name}'`),
    '',
    '/** La misma lista en tiempo de ejecución, para validaciones y tests. */',
    'export const DESKTOP_COMMANDS: readonly DesktopCommand[] = [',
    ...names.map((name) => `  '${name}',`),
    '] as const',
    '',
  ].join('\n')
}

const data = build()
const json = JSON.stringify(data, null, 2) + '\n'
const markdown = render(data)
const union = renderCommandUnion(data)
const jsonPath = join(OUT_DIR, 'desktop-parity.json')
const mdPath = join(OUT_DIR, 'desktop-parity.md')
const unionPath = join(ROOT, 'src', 'platform', 'commands.generated.ts')

/**
 * Cierre de la entrega C (documento 02 §8): «no queda un import Tauri en
 * componentes o servicios fuera del adaptador temporal». El adaptador existe
 * para que cambiar de host sea cambiar de implementación; un import suelto en
 * un componente reintroduce el acoplamiento que la entrega vino a quitar.
 */
const ADAPTER = 'src/platform/tauri.ts'

/**
 * Los nombres de canal son un detalle del host, igual que sus imports: en
 * Electron no significan lo mismo. Fuera del adaptador quedan obsoletos sin
 * que nadie se entere, así que se comprueban aparte —un string no arrastra un
 * import que delate la fuga—.
 */
function channelNamesOutsideAdapter() {
  const offenders = []
  for (const path of frontendFiles()) {
    if (rel(path) === ADAPTER) continue
    const text = readFileSync(path, 'utf8')
    for (const channel of ['rinari-engine-event', 'rinari-menu-action', 'rinari-open-request']) {
      if (text.includes(channel)) offenders.push(`${rel(path)} (${channel})`)
    }
  }
  return offenders.sort()
}

function tauriImportsOutsideAdapter(data) {
  const offenders = new Set()
  for (const names of Object.values(data.platform_apis)) {
    for (const paths of Object.values(names)) {
      for (const path of paths) if (path !== ADAPTER) offenders.add(path)
    }
  }
  const all = [...offenders].sort()
  // El §8 habla de componentes y servicios. Un test que importa el modulo para
  // afirmar sobre su mock es andamiaje, no acoplamiento del producto: se
  // informa y se lleva en la deuda, pero no bloquea.
  return {
    source: all.filter((path) => !path.includes('.test.')),
    tests: all.filter((path) => path.includes('.test.')),
  }
}

if (CHECK) {
  const stale = []
  for (const [path, expected] of [[jsonPath, json], [mdPath, markdown], [unionPath, union]]) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== expected) stale.push(rel(path))
  }
  if (stale.length) {
    console.error(`El inventario de paridad está desactualizado: ${stale.join(', ')}`)
    console.error('Ejecuta `npm run parity:inventory` y confirma el resultado.')
    process.exit(1)
  }
  const leaks = tauriImportsOutsideAdapter(data)
  if (leaks.source.length) {
    console.error(`Imports de @tauri-apps en componentes o servicios (documento 02 §8): ${leaks.source.length}`)
    for (const path of leaks.source) console.error(`  ${path}`)
    console.error('Consúmelos por `platform()` en vez de importar el host directamente.')
    process.exit(1)
  }
  const channels = channelNamesOutsideAdapter()
  if (channels.length) {
    console.error(`Nombres de canal del host fuera de ${ADAPTER}:`)
    for (const entry of channels) console.error(`  ${entry}`)
    console.error('Suscríbete por `platform().events.*`; el canal es del adaptador.')
    process.exit(1)
  }
  if (leaks.tests.length) {
    console.log(`Tests que aún montan el host directamente: ${leaks.tests.length} (deuda declarada, ver docs/debt.md).`)
  }
  console.log(`Inventario al día: ${data.registered_commands} comandos, ${Object.keys(data.platform_apis).length} módulos de plataforma.`)
} else {
  mkdirSync(OUT_DIR, { recursive: true })
  mkdirSync(dirname(unionPath), { recursive: true })
  writeFileSync(jsonPath, json)
  writeFileSync(mdPath, markdown)
  writeFileSync(unionPath, union)
  console.log(`${rel(jsonPath)} y ${rel(mdPath)}: ${data.registered_commands} comandos, ${data.handlers_not_registered.length} sin registrar, ${data.registered_without_frontend_caller.length} sin llamador.`)
}

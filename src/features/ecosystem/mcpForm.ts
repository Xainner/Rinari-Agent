import type { McpConfig, McpServer } from '../../services/engine'

export type McpAuthKind = 'none' | 'bearer' | 'headers'

export interface KeyValue {
  key: string
  value: string
  /** Solo encabezados: un secreto va al llavero y nunca vuelve. */
  secret: boolean
  /** Ya existe guardado: vacío significa «conservar». */
  stored?: boolean
}

export interface McpFormState {
  name: string
  transport: 'stdio' | 'http'
  command: string
  url: string
  auth: McpAuthKind
  token: string
  tokenStored: boolean
  headers: KeyValue[]
  env: KeyValue[]
  timeout: string
}

export const emptyForm = (): McpFormState => ({
  name: '',
  transport: 'stdio',
  command: '',
  url: '',
  auth: 'none',
  token: '',
  tokenStored: false,
  headers: [],
  env: [],
  timeout: '',
})

/**
 * Divide una línea de comando respetando comillas: `npx -y "@scope/pkg"` →
 * ['npx', '-y', '@scope/pkg']. No interpreta variables ni redirecciones: el
 * Engine lanza el programa sin shell.
 */
export function splitCommand(line: string): string[] {
  const parts: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let started = false
  for (const char of line.trim()) {
    if (quote) {
      if (char === quote) quote = null
      else current += char
      continue
    }
    if (char === '"' || char === "'") { quote = char; started = true; continue }
    if (/\s/.test(char)) {
      if (started) { parts.push(current); current = ''; started = false }
      continue
    }
    current += char
    started = true
  }
  if (started) parts.push(current)
  return parts
}

const SENSITIVE = /auth|token|key|secret|password|cookie|session/i

export function formFromServer(server: McpServer): McpFormState {
  const remote = server.transport === 'http'
  return {
    name: server.name,
    transport: remote ? 'http' : 'stdio',
    command: server.argv?.map((part) => (/\s/.test(part) ? `"${part}"` : part)).join(' ') ?? server.command ?? '',
    url: server.url ?? '',
    auth: server.auth?.kind ?? 'none',
    token: '',
    tokenStored: Boolean(server.auth?.token?.configured),
    headers: (server.headers ?? []).map((header) => ({ key: header.name, value: header.secret ? '' : header.value ?? '', secret: header.secret, stored: header.secret && Boolean(header.configured) })),
    env: (server.env ?? []).map((entry) => ({ key: entry.name, value: '', secret: true, stored: entry.configured })),
    timeout: server.timeout_s ? String(server.timeout_s) : '',
  }
}

/**
 * Configuración que se envía al Engine. En una edición, un secreto guardado
 * con el campo vacío no se envía (se conserva); uno que se quitó de la lista
 * se manda como `null` para que el Engine lo borre.
 */
export function configFromForm(form: McpFormState, original?: McpServer | null): McpConfig {
  const config: McpConfig = { transport: form.transport }
  const timeout = Number(form.timeout)
  if (form.timeout.trim() && Number.isFinite(timeout)) config.timeout_s = Math.min(300, Math.max(1, Math.round(timeout)))
  if (form.transport === 'stdio') {
    config.command = splitCommand(form.command)
    const env: Record<string, string | null> = {}
    for (const entry of form.env) {
      const key = entry.key.trim()
      if (!key) continue
      if (entry.value) env[key] = entry.value
      else if (!entry.stored) continue
    }
    for (const previous of original?.env ?? []) if (!form.env.some((entry) => entry.key.trim() === previous.name)) env[previous.name] = null
    if (Object.keys(env).length) config.env = env
    return config
  }
  config.url = form.url.trim()
  if (form.auth === 'bearer') config.auth = form.token ? { kind: 'bearer', token: form.token } : { kind: 'bearer' }
  else config.auth = { kind: form.auth }
  if (form.auth === 'headers') {
    const headers: NonNullable<McpConfig['headers']> = {}
    for (const header of form.headers) {
      const key = header.key.trim()
      if (!key) continue
      if (header.value) headers[key] = { value: header.value, secret: header.secret || SENSITIVE.test(key) }
    }
    for (const previous of original?.headers ?? []) if (!form.headers.some((header) => header.key.trim() === previous.name)) headers[previous.name] = null
    if (Object.keys(headers).length) config.headers = headers
  }
  return config
}

/** Lo mínimo para poder probar o guardar. */
export function formReady(form: McpFormState): boolean {
  if (!form.name.trim()) return false
  if (form.transport === 'stdio') return splitCommand(form.command).length > 0
  if (!/^https?:\/\/\S+$/i.test(form.url.trim())) return false
  if (form.auth === 'bearer') return Boolean(form.token || form.tokenStored)
  return true
}

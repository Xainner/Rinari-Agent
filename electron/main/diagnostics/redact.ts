/**
 * Redacción de lo que se escribe en los registros de diagnóstico.
 *
 * Un registro acaba adjunto a un issue público: antes de escribir se quitan
 * credenciales con forma reconocible y la carpeta personal se reduce a `~`.
 * Es una red de seguridad, no un permiso para registrar contenido: los
 * llamadores siguen sin escribir mensajes, archivos ni parámetros.
 */
import { homedir } from 'node:os'

const SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  // Cabeceras y pares clave=valor con nombre de secreto.
  /\b(authorization|proxy-authorization)\s*[:=]\s*(bearer|basic|token)?\s*[^\s,;"']+/gi,
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|secret|password|passwd|token)\b(["']?\s*[:=]\s*["']?)[^\s,;"'&]+/gi,
  // Formatos conocidos de claves y tokens.
  /\bsk-(?:ant-|proj-|or-)?[A-Za-z0-9_-]{12,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bAIza[0-9A-Za-z_-]{20,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  // Credenciales dentro de una URL (`https://user:pass@host`).
  /(?<=:\/\/)[^\s/@:]+:[^\s/@]+(?=@)/g,
]

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function createRedactor(home: string = homedir()): (text: string) => string {
  const homes = [...new Set([home, home.replace(/\\/g, '/')])].filter((value) => value.length > 3)
  const homePattern = homes.length ? new RegExp(homes.map(escapeRegExp).join('|'), 'gi') : null
  return (text: string) => {
    let result = text
    for (const pattern of SECRET_PATTERNS) {
      result = result.replace(pattern, (_match, name?: string, separator?: string) =>
        typeof name === 'string' && typeof separator === 'string' && /[:=]/.test(separator)
          ? `${name}${separator}[redacted]`
          : '[redacted]',
      )
    }
    return homePattern ? result.replace(homePattern, '~') : result
  }
}

export const redact = createRedactor()

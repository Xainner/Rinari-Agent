import type { EngineStatus } from './engine'
import engineManifest from '../../engine-manifest.json'

export const APP_REPOSITORY = 'https://github.com/Xainner/Rinari-Agent'
export const SOUL_VERSION = '4.0'

/** Versiones y sistema para reproducir un problema; nunca rutas ni datos del usuario. */
export function diagnostics(version: string, status: EngineStatus | null): string {
  return [
    `Rinari Agent: ${version}`,
    `Rinari Engine: ${status?.engine_version ?? 'unknown'} (${engineManifest.engine_git_sha.slice(0, 7)})`,
    `Engine Protocol: ${status?.protocol_version ?? 'unknown'}`,
    `Engine state: ${status?.state ?? 'unknown'}`,
    `Soul: rinari-default ${SOUL_VERSION}`,
    `OS: ${typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent.match(/\(([^)]+)\)/)?.[1] ?? 'unknown'}`,
  ].join('\n')
}

export function issueUrl(kind: 'bug' | 'idea', body: string, title = ''): string {
  const query = new URLSearchParams({ labels: kind === 'bug' ? 'bug' : 'enhancement', title, body })
  return `${APP_REPOSITORY}/issues/new?${query.toString()}`
}

/** La bandeja y Acerca de abren el mismo borrador, sin enviar el reporte. */
export function bugReportUrl(version: string, status: EngineStatus | null, template: string): string {
  return issueUrl('bug', `${template}\n\n---\n${diagnostics(version, status)}`)
}

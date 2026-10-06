import { useEffect } from 'react'
import { translate } from '../../i18n'
import type { Language } from '../../types'
import type { UpdateState } from '../../platform'
import { checkForUpdates, onUpdateState, updateSnapshot } from '../../services/updates'
import { useNotificationCenter } from '../../stores/notificationCenter'

/** Cada cuánto se busca una versión nueva con la app abierta (además del arranque). */
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
/** Versiones ya anunciadas y en qué fase: `available` o `ready` (descargada). */
export const UPDATE_ANNOUNCED_KEY = 'rinari.updates.announced.v1'

type Stage = 'available' | 'ready'

/** Compara `x.y.z` numéricamente; lo que no es número cuenta como 0. */
export function compareVersions(a: string, b: string): number {
  const parts = (value: string) => value.replace(/^v/, '').split(/[.+-]/).slice(0, 3).map((part) => Number.parseInt(part, 10) || 0)
  const left = parts(a)
  const right = parts(b)
  for (let i = 0; i < 3; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff) return diff
  }
  return 0
}

function readAnnounced(): Record<string, Stage> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(UPDATE_ANNOUNCED_KEY) ?? '{}')
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  } catch {
    return {}
  }
}

function writeAnnounced(value: Record<string, Stage>) {
  try {
    window.localStorage.setItem(UPDATE_ANNOUNCED_KEY, JSON.stringify(value))
  } catch {
    // Sin almacenamiento: en esta ventana se anuncia igual, una vez por fase.
  }
}

const ROW = 'update:'

/**
 * Una versión nueva también queda en la campana (Sistema), no solo en el
 * aviso emergente. Lee el estado del actualizador del host, que es quien
 * manda: al montar (`snapshot`, para lo que pasó antes) y en vivo
 * (`onState`). Una fila por versión ofrecida; avisa una vez al detectarla y
 * otra al quedar descargada. Volver a consultar, cambiar de idioma o cerrar
 * la campana no la reactiva; la × la retira hasta que haya otra fase u otra
 * versión. Se retira sola al instalarse, al aparecer una posterior o cuando
 * una consulta confirma que ya no hay nada. Abrirla lleva a Acerca de, que
 * muestra la versión y la acción; nada se descarga ni instala por el clic.
 */
export function reconcileUpdate(state: UpdateState, previous: UpdateState['phase'] | null, lang: Language): void {
  const center = useNotificationCenter.getState()
  const offered = state.available_version
  for (const row of center.items) {
    if (!row.id.startsWith(ROW)) continue
    const version = row.id.slice(ROW.length)
    const installed = compareVersions(version, state.current_version) <= 0
    const superseded = Boolean(offered) && compareVersions(version, offered!) < 0
    // Solo una consulta terminada sin oferta dice «ya no hay»; el `idle`
    // inicial (aún sin consultar) o un error de red no.
    const withdrawn = previous === 'checking' && state.phase === 'idle' && !offered
    if (installed || superseded || withdrawn) center.dismiss(row.id)
  }
  if (!offered || compareVersions(offered, state.current_version) <= 0) return
  const stage: Stage | null = state.phase === 'downloaded'
    ? 'ready'
    : state.phase === 'available' || state.phase === 'downloading'
      ? 'available'
      : null
  if (!stage) return
  const announced = readAnnounced()
  if (announced[offered] === stage || (stage === 'available' && announced[offered] === 'ready')) return
  const kept = Object.fromEntries(Object.entries(announced).filter(([version]) => compareVersions(version, state.current_version) > 0))
  writeAnnounced({ ...kept, [offered]: stage })
  center.push({
    id: `${ROW}${offered}`,
    module: 'system',
    tone: stage === 'ready' ? 'success' : 'info',
    title: translate(lang, stage === 'ready' ? 'update.ready' : 'update.available', { v: offered }),
    body: translate(lang, 'update.bellHint'),
    target: { kind: 'update' },
  })
}

export default function UpdateNotifier({ lang }: { lang: Language }) {
  useEffect(() => {
    let alive = true
    let previous: UpdateState['phase'] | null = null
    let stop: (() => void) | undefined
    const apply = (state: UpdateState) => {
      if (!alive) return
      const before = previous
      previous = state.phase
      reconcileUpdate(state, before, lang)
    }
    void onUpdateState(apply)
      .then((unsubscribe) => { if (alive) stop = unsubscribe; else unsubscribe() })
      .catch(() => {})
    void updateSnapshot().then(apply).catch(() => {})
    // Una versión publicada con la app abierta aparece sin reiniciar. Sin
    // canal (desarrollo) la consulta lanza: es silenciosa, como la del arranque.
    const timer = window.setInterval(() => { void checkForUpdates().catch(() => {}) }, UPDATE_CHECK_INTERVAL_MS)
    return () => {
      alive = false
      stop?.()
      window.clearInterval(timer)
    }
  }, [lang])
  return null
}

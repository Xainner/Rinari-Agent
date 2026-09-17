/**
 * Estado del Engine visto por el renderer.
 *
 * Vive aparte del contrato porque lo producen los dos hosts y lo consume
 * `services/engine.ts`; tenerlo aquí evita que el adaptador dependa del
 * servicio o al revés.
 */

export type EngineState =
  | 'stopped'
  | 'starting'
  | 'handshaking'
  | 'ready'
  | 'degraded'
  | 'restarting'
  | 'failed'

export interface EngineStatus {
  state: EngineState
  engine_version: string | null
  protocol_version: number | null
  detail: string | null
  capabilities: Record<string, boolean>
  /** Identidad estable del Engine home; `null` en engines antiguos. */
  home_id?: string | null
}

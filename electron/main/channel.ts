/**
 * Canal de la build. Rinari Agent Nightly se instala junto a la normal: otra
 * identidad de Windows (barra de tareas, avisos), otra carpeta de datos de la
 * app y otro nombre, para que las dos no se pisen. Comparten `~/.rinari`
 * (conversaciones, proveedores, memoria): el Engine es el mismo home.
 *
 * `RINARI_BUILD_CHANNEL` lo fija `scripts/build-desktop.mjs` al construir; en
 * el release no se lee del entorno.
 */
export type Channel = 'stable' | 'nightly'

export const CHANNEL: Channel = process.env.RINARI_BUILD_CHANNEL === 'nightly' ? 'nightly' : 'stable'
export const IS_NIGHTLY = CHANNEL === 'nightly'
export const PRODUCT_NAME = IS_NIGHTLY ? 'Rinari Agent Nightly' : 'Rinari Agent'
export const APP_USER_MODEL_ID = IS_NIGHTLY ? 'com.rinari.agent.nightly' : 'com.rinari.agent'
/** Carpeta de datos de la app dentro de `%APPDATA%` (la normal sale de package.json). */
export const NIGHTLY_USER_DATA_DIR = 'rinari-agent-nightly'

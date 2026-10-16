/**
 * Canal de la build del renderer. Rinari Agent Nightly (ver
 * electron/main/channel.ts) se nombra distinto para no confundirse con la
 * normal: título de la ventana, barra de tareas y avisos. `npm run nightly`
 * fija `VITE_RINARI_CHANNEL` al construir.
 */
export const IS_NIGHTLY = import.meta.env.VITE_RINARI_CHANNEL === 'nightly'
export const APP_NAME = IS_NIGHTLY ? 'Rinari Agent Nightly' : 'Rinari Agent'
/**
 * Commit del Engine de esta build. La Nightly lleva la punta de la rama del
 * CLI, no el pin de `engine-manifest.json`, y lo fija `npm run nightly`.
 */
export const ENGINE_SHA_OVERRIDE: string | undefined = import.meta.env.VITE_RINARI_ENGINE_SHA || undefined

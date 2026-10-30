/**
 * Carga una dirección en una vista y la da por buena aunque el sitio
 * redirija mientras carga.
 *
 * `loadURL` rechaza con `ERR_ABORTED (-3)` cuando otra navegación sustituye a
 * la pedida: un sitio que manda de `https://xainner.com` a `/es/` por script
 * hacía fallar `browser.open` con la página ya abierta y en pantalla, y el
 * agente reintentaba. Si tras el aborto la vista está en otra dirección, la
 * carga sí ocurrió.
 */
export async function loadPage(
  contents: { loadURL(url: string): Promise<void>; getURL(): string },
  url: string,
): Promise<void> {
  try {
    await contents.loadURL(url)
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error)
    const landed = contents.getURL()
    if (/ERR_ABORTED|\(-3\)/.test(text) && landed && landed !== 'about:blank') return
    throw error
  }
}

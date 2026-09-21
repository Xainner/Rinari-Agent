/**
 * Colores del chrome de la ventana, compartidos entre el host y la hoja de
 * estilos del renderer.
 *
 * Existe porque el mismo color estaba escrito dos veces y divergió. Electron
 * pinta la franja de los controles nativos con `titleBarOverlay.color`,
 * mientras que la barra React `.app-topbar` usa `--bg-subtle`. El host decía
 * `#0b0b0f` y la hoja de estilos `#15151b`, así que detrás de minimizar,
 * maximizar y cerrar aparecía una banda más oscura que el resto de la barra.
 *
 * No es una API: son constantes. El color del chrome no se acepta desde el
 * renderer ni desde contenido remoto —sería dejar que una página decidiera el
 * aspecto de la ventana del sistema—, así que aquí no hay setter.
 */

/**
 * Fondo de la barra superior. **Tiene que seguir a `--bg-subtle`** del tema
 * oscuro en `src/styles/index.css`; si uno cambia, cambia el otro.
 *
 * Es `#14111f` y no `#15151b`: la hoja de estilos declara `--bg-subtle` dos
 * veces sobre `:root`, y gana la segunda —el bloque «Rinari concept
 * foundation»— por orden de cascada. Medido sobre la ventana en ejecución, no
 * leído del primer bloque. La prueba de al lado toma la última declaración por
 * esa misma razón.
 */
export const CHROME_BACKGROUND = '#14111f'

/** Color de los glifos de los controles nativos. Contraste AA sobre el fondo. */
export const CHROME_SYMBOL = '#e6e6ea'

/** Alto de la franja de controles, en DIP. Coincide con `.app-topbar`. */
export const CHROME_OVERLAY_HEIGHT = 36

# Obsidiana neón — sistema de diseño de Rinari Agent

Vigente desde el rediseño de octubre de 2026. Es la referencia para cualquier
pantalla nueva o cambio visual. Si algo aquí choca con AGENTS.md §49 (accesibilidad)
o §58 (la interfaz no exagera lo que pasó), mandan esas reglas.

## 1. Identidad

Tinta negra con el violeta neón de los audífonos de Rinari. Superficies de
vidrio sobre una nebulosa tenue, líneas finas teñidas de violeta y **un solo
acento fuerte por pantalla** (el botón principal o el estado que importa).
Magenta solo en degradados; cian para lo que hacen los subagentes y la
selección.

Rinari aparece cuando aporta: su expresión sigue el **estado real** (turno,
Engine, dictado). Nunca adorna un resultado ni sustituye al texto que lo dice.

## 2. Tokens (`src/styles/index.css`, bloque `:root`)

Una sola fuente. Las pantallas usan nombres semánticos, nunca hex:

| Uso | Token |
|---|---|
| Fondos, del más oscuro al más elevado | `--bg-app`, `--bg-sidebar`, `--bg-subtle`, `--bg-elevated`, `--bg-hover`, `--bg-active`, `--bg-inset` |
| Líneas | `--line-1` (separadores), `--line-2` (bordes de control), `--line-3` (hover/foco) |
| Texto | `--text`, `--text-muted`, `--text-subtle` |
| Marca | `--accent` (violeta 500), `--accent-2` (violeta claro: enlaces, iconos), `--accent-3` (magenta), `--grad-brand`, `--grad-text` |
| Estado | `--success`, `--warning`, `--danger`, `--info`, `--agent` (cian) |
| Radios | `--r-xs` 6 · `--r-sm` 9 · `--r-md` 12 · `--r-lg` 16 · `--r-xl` 22 |
| Sombras | `--sh-1/2/3`, `--sh-pop`, `--glow-1/2`, `--inset-hi` |
| Movimiento | `--dur-fast` 120 ms · `--dur-base` 220 ms · `--dur-slow` 420 ms · `--ease-out`, `--ease-spring` |

`--bg-subtle` es también el color del chrome nativo (`electron/shared/chrome.ts`);
una prueba compara los dos.

El tema claro está **en preparación**: será un segundo bloque con los mismos
nombres. Hasta que todas las pantallas lo soporten, Apariencia no lo ofrece.

## 3. Tipografía

- **Bricolage Grotesque** (`font-display`): títulos, el nombre de Rinari, cifras grandes.
- **Instrument Sans**: cuerpo y controles (12–15 px; 13 px por defecto en controles).
- **JetBrains Mono**: código, rutas, IDs, comandos.

Las tres van empaquetadas (sin red).

## 4. Componentes canónicos

Antes de escribir estilos, usa lo que ya existe:

- Botones: clases `.btn` + `btn-primary | btn-secondary | btn-ghost | btn-quiet | btn-danger` y tamaños `btn-sm | btn-xs | btn-lg | btn-icon` (también vía `<Button>`).
- Campos: `.field-input`, `.field-label`, `.field-hint`.
- Pestañas y segmentados: `.seg-tabs` / `.seg-tab` con la píldora `.seg-tab-pill` (framer-motion `layoutId`); navegación por flechas.
- Overlays: `Dialog`, `AlertDialog`, `DropdownMenu`, `Popover`, `Tooltip` de `src/components/ui` (clases `.r-overlay`, `.r-dialog`, `.r-pop`, `.r-tip` con entrada y salida).
- Tarjetas de ajustes: `Section` (`.settings-card`). Tostadas: Sonner con `.rinari-toast`.
- Estados vacíos: un chibi de Rinari + título en display + una frase útil (`.dock-empty`, `.mcp-empty`, `.notify-empty`).
- Rinari: `<RinariAvatar state=…>` (`src/features/rinari`). Estados: `idle`, `listening`, `thinking`, `working`, `streaming`, `waiting`, `done`, `error`, `offline`.

No crees una segunda familia de botones, badges o puntos de estado.

## 5. Movimiento

- Todo lo que aparece, entra; todo lo que se va, sale. 120 ms para micro, 220 ms para controles, 420 ms para tarjetas y vistas.
- Los **bucles** (brillo, órbita, borde que fluye) significan «sigue trabajando» y se apagan al terminar.
- Celebrar solo lo que acaba de pasar: el check de una operación se dibuja si se vio pasar de «en curso» a «completada»; al volver a montarse aparece quieto.
- Con «Reducir animaciones» (sistema o ajuste) queda el cambio de estado, sin desplazamiento ni bucles. En framer-motion usa `useCalmMotion()` y `instant`/`spring` de `src/lib/motion.ts`.
- **Sin rebote en lo que cambia de tamaño.** Un indicador que sigue a un elemento (la píldora de unas pestañas, un subrayado) se mide sobre él y solo se desliza cuando cambia la selección; si cambia el ancho del contenedor se recoloca sin animar. Un `spring` de framer-motion con `layoutId` sobre etiquetas que aparecen o se ocultan por tamaño rebota de un lado a otro: ahí usa una transición sin sobrepaso.
- **Lo que aparece no mueve lo demás.** Un contador, un chip o un aviso que aparece no cambia la altura de su barra ni empuja el contenido: si no cabe, se desplaza o se recorta. Si algo salta mientras el usuario pulsa, el clic cae en otro sitio (la barra de Boards lo comprueba en `boards-fit`).
- **Una animación nunca es necesaria para llegar al estado final.** Si no avanza (ventana sin pintar, CI, equipo lento), el elemento tiene que quedar en su tamaño y estado finales igual: termina también con un temporizador, no solo con `animationend`.
- **Animar cambios, no montajes.** Plegar, desplegar o cerrar un panel se anima cuando el usuario lo cambia, no cada vez que la vista se monta. Para animar una salida sin retener el contenido real (y su navegador nativo), deja un fantasma vacío del mismo tamaño que se pliega.
- **El foco lo dibuja el anillo global.** No añadas `outline` propio en `:focus-visible` de botones: hay un anillo neutro común y una prueba lo vigila.
- **Nada de `transform` ni `filter` en contenedores que tengan dentro el navegador nativo** durante su vida: mueven el rectángulo de la `WebContentsView`. Las vistas entran solo con opacidad; el panel lateral puede deslizarse porque `useNativeBrowser` vuelve a medir en `animationend`/`transitionend`.

## 6. Arte de Rinari

Fuente y proceso en `Documents/Proyectos/rinari-agent/art-v2/` (fuera del repo):
`CHARACTER.md` (invariantes del personaje), `ref/` (referencias oficiales),
`job-*.txt` (prompts de Codex), `out/` (PNG aprobados), `export.py` (WebP 512 px
para la app), `sheet.py` (hoja de revisión), `collect.py` (recoge lo que generó
Codex).

- Expresiones `exp-<nombre>` (bustos cuadrados con el mismo encuadre) y chibis `chibi-<pose>` en `src/assets/rinari/*.webp`; se consumen con `art.expression()` / `art.chibi()` (`src/features/rinari/art.ts`), que cae en una pieza aprobada si falta una.
- Arte del instalador: `build/installer/source/rinari-*.png` (medio cuerpo 2:3, mismo encuadre) y `studio-generated.png`; `npm run installer:art` los verifica y copia.
- Generar: Codex CLI con la skill `imagegen` (guía en `~/.claude/skills/promo-video/references/codex-imagegen.md`), máximo 5 referencias por trabajo, invariantes repetidas en el prompt, fondo transparente real, sin texto.
- Revisar siempre a mano (identidad, accesorios del lado correcto, manos, alfa) con `sheet.py` antes de exportar. Codex dice «revisado» aunque falle.

## 7. Criterios para una pantalla nueva

1. ¿Usa solo tokens y componentes canónicos?
2. ¿Tiene sus estados: cargando, vacío (con arte si aporta), error con salida, y el normal?
3. ¿Dice la verdad? Un dato desconocido no se muestra como cero; «solicitado» no es «hecho»; una opción que no funciona no se ofrece.
4. ¿Entra y sale con el movimiento de §5, y respeta «Reducir animaciones»?
5. ¿Funciona con teclado, foco visible, etiquetas accesibles y sin depender solo del color?
6. ¿Lenguaje llano? En la interfaz no se dice «Engine» ni «motor»: se dice Rinari, «esta versión de Rinari» o el núcleo cuando hace falta.
7. ¿Conserva los ganchos de las pruebas nativas (`tests/ui`)? Clases, `data-*` y `aria-label` que usan los escenarios no se renombran sin actualizar el escenario.
8. Si añade movimiento, ¿las pruebas que miden geometría esperan a que acabe? Antes de medir, espera las animaciones finitas (`document.getAnimations()` sin las infinitas, como en `tests/ui/boards-fit`). Para comprobar que algo no rebota o sí se anima, muestrea cuadro a cuadro con `requestAnimationFrame` (como `dock-pill-resize` y `boards-fold` en `ui-tour`) en lugar de fiarte de una captura.
9. ¿Rinari aparece una sola vez por contexto? En Boards su cara vive en la cabecera del panel y sigue el turno en curso; dentro del chat del panel no se repite.
10. ¿Pasa con movimiento reducido? El CI corre con `prefers-reduced-motion` activado: repite los escenarios tocados con `RINARI_UI_REDUCED_MOTION=1`, y los que miden movimiento lo emulan desactivado (`Emulation.setEmulatedMedia`, como `title-rename-motion`). Nunca un retraso fijo antes de comprobar: espera el estado real con `until(...)`.
11. ¿Se ve bien en el recorrido visual? `npm run ui:e2e -- ui-tour` deja capturas de todas las superficies en `release/evidence/ui/ui-tour/`.

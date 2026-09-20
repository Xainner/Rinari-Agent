# Browser nativo: decisiones de clipping, DPI, input y CDP

Registro que exige el documento 03 §3 del plan de migración a Electron. Recoge
las decisiones de la prueba vertical y **la medición que hay detrás de cada
una**.

Lo que no es: una promesa de paridad de herramientas. El §3 acota esta etapa a
«viabilidad de la integración elegida». Lo que aquí se decide es qué mecanismos
sostienen el diseño; qué operaciones se implementan y con qué cobertura es la
entrega F.

## Cómo se obtuvieron estos datos

```bash
npm run desktop:build && npm run browser:probe
```

La sonda (`electron/probe/browserViability.ts`) abre un proceso Electron real,
sirve una página determinista en loopback con puerto efímero
(`electron/probe/fixture.ts`) y publica su informe en
`browser-native.probe.json`, que se versiona junto a este documento. Sin
credenciales, sin servicios externos, sin red.

Las cifras de abajo son de esta ejecución:

| | |
|---|---|
| Electron | 44.4.1 (Chromium 152.0.7977.78) |
| Plataforma | win32 x64, factor de escala 1 |
| Geometría | ventana 900×700 · recorte 400×300 en (60,80) · bounds lógicos 760×560 |

Una comprobación que no se pudo ejecutar sale como `inconclusive`, no como
aprobada. El valor de la sonda es que este documento se escriba con hechos, y
eso se pierde en cuanto un hueco se cuenta como un sí.

## 1. Clipping: la jerarquía de vistas recorta

**Decisión.** La `WebContentsView` no se cuelga de `window.contentView`: va
dentro de una `View` contenedora cuyos bounds son **el rectángulo visible**,
mientras la vista hija conserva **los bounds lógicos** del panel. El
contenedor recorta.

**Por qué importa.** El §8.2 prohíbe que desplazar el board cambie el viewport
del documento al ancho del recorte, y el §8.3 avisa de no dar por hecho que
`overflow: hidden` de un div recorte una superficie nativa. Con una sola
`setBounds` no hay forma de cumplir ambas: el rectángulo visible y el tamaño
del documento serían el mismo número.

**Medido.** Con un recorte de 400×300 y bounds lógicos de 760×560:

- `CLIP-01`: la página siguió informando `innerWidth/innerHeight` de 760×560.
  El recorte no encogió el viewport.
- `CLIP-02`: en la composición real del sistema —capturada con
  `desktopCapturer`, no con `capturePage`, que no incluiría las vistas nativas
  hijas— el color plano de la página ocupó ~109 279 px, compatible con los
  120 000 px del recorte y lejos de los 425 600 px del área lógica.

La geometría está elegida para que la prueba signifique algo: el área lógica
termina en (820, 640), **dentro** de la ventana de 900×700. Si no hubiera
recorte del contenedor, la página se habría visto entera sin que la ventana la
cortara. Los 109 279 px sólo se explican por el contenedor.

**Consecuencia.** El fallback geométrico del §8.3 —ocultar la vista y mostrar
una captura estática cuando queda parcialmente fuera— **no hace falta** para
scroll horizontal ni para colapso parcial del panel en esta plataforma. Sigue
siendo el plan si otra plataforma mide distinto. No se implementa por si acaso.

### Una vista que nunca se compone no maqueta

Esto salió de uso real, y es el límite del párrafo anterior: el contenedor
recorta, sí, pero **si recorta a nada la página no llega a existir**. Medido con
la misma jerarquía y la página cargada:

| contenedor | `innerWidth` | `capturePage` |
|---|---|---|
| 0×0 | 0 | 0 bytes |
| con tamaño, `setVisible(false)` desde el nacimiento | 0 | 0 bytes |
| 0×0 + `enableDeviceEmulation` | 1280 | 0 bytes |
| **1×1 visible** | 1280 | 4714 bytes |
| escondido **después** de componerse | 799 | 5556 bytes |

Tres cosas que no son obvias. La vista toma su viewport de **sus propios
bounds** aunque el contenedor la recorte a un píxel. La emulación de
dispositivo arregla la maquetación pero no la composición, así que no sirve
para capturar. Y esconder es reversible sólo si la vista llegó a componerse
alguna vez: el estado «escondida» conserva lo que había, no lo crea.

**Consecuencia.** El contenedor de un contexto no baja nunca de 1×1. Un turno
puede usar el browser antes de que nadie abra el panel —y el §8.3 exige que
ocultarlo no rompa una herramienta que esté usando ese target—, así que un
contexto sin presentar mantiene ese suelo en vez de irse a cero. Sin él, la
página no tiene viewport: ni coordenadas de click, ni `loading="lazy"`, ni
imagen.

## 2. DPI: `setBounds` habla en DIP, la captura en píxeles físicos

**Decisión.** La geometría del slot se envía a main **sin multiplicar por
`devicePixelRatio`**. Las imágenes que vuelven de una captura se interpretan en
píxeles físicos y se rotulan con su tamaño y escala.

**Medido** (`DPI-01`, repetido forzando el factor de escala por proceso, que es
la única forma de fijarlo):

| Factor | `setBounds` → `innerWidth/Height` | `capturePage` | Viewport lógico |
|---|---|---|---|
| 1× | 760×560 | 760×560 | conservado |
| 1,25× | 760×560 | 950×700 | conservado |
| 1,5× | 760×560 | 1140×840 | conservado |
| 2× | 760×560 | 1520×1120 | conservado |

Los bounds y el viewport del documento no se mueven con la escala; la captura
sí, exactamente por el factor. Es la respuesta a la advertencia del §8.2 de no
multiplicar todo por `devicePixelRatio` sin saber qué unidad pide cada API:
**colocar** es DIP, **interpretar una imagen** es físico.

Coordenadas de pantalla para entrada del sistema: `screen.dipToScreenPoint`.
No se compone a mano con el factor de escala.

## 3. Input y arbitraje: presentación segura por propietario

Las mediciones originales siguen siendo útiles: `before-input-event`,
`before-mouse-event` e `Input.setIgnoreInputEvents` bloquean también el input
que el broker manda por CDP. Una vista superpuesta separó las rutas en una
`BaseWindow`, pero en la `BrowserWindow` de producto bloqueó también el click
CDP. Esa contradicción no se usa ya como base de seguridad.

La solución adoptada es el modo de presentación por propietario recomendado en
el correctivo:

- con control **agent**, la `WebContentsView` real sigue viva y compuesta en un
  suelo de 1×1 DIP; el renderer muestra capturas acotadas del **mismo target**;
- con control **user**, y sólo tras la revisión confirmada por el Engine, main
  restaura esa misma vista a los bounds del slot;
- al devolver el control, main la retira otra vez sin navegar, recrear ni
  cambiar el DOM.

Así no existe una superficie remota bajo el cursor mientras opera el agente.
`V2p` lo prueba con mouse y teclado reales del sistema: clicks 0 → 0 y campo sin
cambios. En la misma vista retirada, `V2c` manda un click por CDP y llega 0 → 1.
`V5` toma control, restaura la vista, escribe mediante entrada física, rechaza
una mutación concurrente con `CONFLICT` y el agente observa la edición al
recuperar el control.

La captura de presentación no crea otro browser ni recarga la URL: sale de
`capturePage()` sobre el target activo. El floor conserva viewport,
`loading="lazy"` y capturas aunque el dock no se haya abierto (`V10`).

Los overlays modales siguen retirando la superficie antes de ser interactivos.
La barrera nativa se conserva sólo como sonda de hit-testing (`V7b`), no como
autoridad de control ni como bypass temporal.

### 3.1 Toasts sobre superficies nativas

Los toasts usan una sola renderer y la API pública de Sonner. `AdaptiveToaster`
elige entre seis posiciones que no solapen slots nativos y congela la posición
mientras la pila está activa. Si ninguna cabe, publica una oclusión acotada;
main recorta la vista al mayor rectángulo contiguo que no la invada, conserva
los bounds lógicos de la página y baja al floor si no queda un área útil. Al
desaparecer la pila vuelve exactamente la geometría anterior. No hay una
segunda ventana transparente ni otro preload privilegiado.

## 4. CDP: transporte sí, superficie pública no

**Decisión.** El broker expone una **allowlist** de operaciones semánticas y
traduce cada una a los comandos CDP concretos. No hay paso de CDP en crudo, ni
siquiera filtrado por denylist.

**Medido.**

- `CDP-01`: responden los seis dominios que necesitan snapshot, a11y,
  screenshot e input — `Page`, `DOM`, `Runtime`, `Accessibility`, `Network`,
  `Input`.
- `CDP-03`: `Page.captureScreenshot` devuelve el target adjunto con tamaño
  identificable (PNG de 760×560).
- `CDP-02`: **`Target.getTargets`, `Browser.getVersion` y
  `Browser.setDownloadBehavior` responden desde la sesión page-level.**

El §6.3 suponía que las APIs browser-level no se alcanzarían y habría que
implementar equivalencias. La medición dice lo contrario, y es peor noticia que
la prevista: no faltan, **sobran**. Un passthrough ingenuo daría a una
herramienta ámbito mayor que su target.

`ISO-02` lo confirma: `Target.getTargets` desde la sesión A devolvió los 3
targets del fixture, incluidos los de otras particiones. La enumeración que
recibe el modelo tiene que venir de la registry del broker, nunca de esta
llamada, tal como pide el §5.3.

**DevTools** (`CDP-04`): en 44.4.1 abrir DevTools sobre la página **no**
desenganchó el debugger, al contrario de lo que anticipa [E5]. No se explota:
la versión puede cambiarlo y el §3 pide no prometer dos controladores. El
broker se suscribe a `detach`, invalida sus pendientes y declara el contexto
sin control cuando llegue.

## 5. Aislamiento entre sesiones

**Decisión.** Una partición por contexto de sesión, distinta de la del renderer
de Rinari y de las demás sesiones (§6.2).

**Medido** (`ISO-01`): con la misma URL en dos particiones, la segunda no vio
el `localStorage` escrito por la primera. La comprobación incluye que la
primera **sí** relea su marca, para que un fallo de escritura no pase por
aislamiento.

## 6. Los ocho pasos del §3

```bash
npm run desktop:build && npm run browser:vertical
```

Un Engine real, el pipeline real de herramientas y policy, y un modelo falso
que sirve llamadas a herramienta guionizadas por loopback
(`scripts/fake-model.mjs`). Lo único fingido es **qué pide el modelo**: el
adaptador del proveedor, el bucle de turno, la policy y la ejecución de
herramientas son los de producción, que es lo que pide el §3 al exigir que la
prueba «no dependa de que un LLM produzca casualmente el comando correcto».

Cada paso se comprueba mirando **la vista nativa**, no el resultado de la
herramienta: que `browser.fill` devuelva `ok` no demuestra que cambiara la
página que el usuario tiene delante.

| | Paso del §3 | Cómo se comprueba |
|---|---|---|
| V1 | Vista en blanco con contexto registrado | el contexto es de esa sesión y su target está en `about:blank` |
| V2 | Un turno navega al fixture | la vista **que ya existía** queda en la URL; no se creó otra |
| V2d | Red inicial | el request del documento aparece porque Runtime/Network se habilitan antes de la navegación real |
| V2p | Exclusión física del agente | mouse y teclado del sistema no alcanzan la página retirada |
| V3 | Snapshot, llenar y click | `#result` pasa a `applied` con el valor que escribió la herramienta, leído del webContents |
| V4 | Screenshot con tamaño y target | bytes > 0 y el target es el de esta sesión |
| V5 | Control manual | con el usuario al mando `browser.click` acaba en `tool.failed` con `CONFLICT`; al devolver el control el agente lee la edición manual |
| V6 | Segunda sesión, misma URL | no ve su `localStorage` y su target no se resuelve desde el contexto ajeno |
| V7 | Recorte y overlay | el recorte baja a 200×140 y el viewport sigue en 760×560 |
| V8 | Matar el Engine | tras reiniciarlo el contador de clicks de la página no subió |

Tres comprobaciones más, que no son pasos del §3 pero sin las cuales los demás
no significan lo que parecen:

- **V2b** — el Engine sigue respondiendo a `engine.info` después de una
  operación de browser. Está por lo que se cuenta abajo.
- **V2c** — un click por CDP emitido desde main llega a la página. Sin este
  control, un fallo del paso 3 no distingue «el broker no funciona» de «esta
  vista no recibe input», y se depura el sitio equivocado.
- **V9** — soltar el slot retira la vista de la ventana, y la página sigue
  usable: conserva su viewport y se puede capturar. Va por los servicios que
  invoca el IPC del renderer —reservar, publicar geometría, soltar— y no
  llamando a la registry a mano, porque el fallo que motivó el paso estaba
  justo en ese cableado.
- **V10** — un contexto que **nunca** se presentó maqueta y se captura igual.
  Es el caso extremo del §8.3 y el que llegó desde uso real.
- **V11** — el agente escribe un fichero y lo sube; el `input` de la página
  acaba con él. Se mira el DOM, no el `ok` de la herramienta.
- **V12** — una descarga cuyo `Content-Disposition` propone
  `../../CON.txt` aterriza dentro del directorio de artefactos y con un nombre
  que es un componente de ruta. Es BR-09 en el camino real.
- **BR-13** — 100 ciclos con dos targets, reattach del debugger, consola/red,
  descargas, show/hide, detach y dispose. Contextos, targets, webContents,
  debuggers, listeners, slots, ledger e in-flight vuelven al baseline; un log
  tras reattach produce exactamente un evento.
- **BR-14** — captura cercana al límite, buffers ruidosos, respuesta que excede
  8 MiB y mutación lenta contra Stop. El Engine sigue respondiendo, el exceso
  termina en `RESOURCE_EXHAUSTED`, la mutación queda incierta sin retry y el
  control manual no se concede antes del settlement. Stop midió 1–2 ms.

### Descargas: deny por defecto, y Chromium sanea antes que tú

Dos cosas que no eran obvias al portarlas.

**Sin manejador de `will-download`, Electron abre el diálogo de guardado del
sistema.** O sea: la primera página con una descarga automática le planta al
usuario un cuadro modal que no pidió, sobre una ruta que nadie acotó. Por eso
la partición de un contexto nace cancelando descargas y sólo las acepta cuando
alguien pide un destino, que además siempre es el directorio de artefactos de
la sesión.

**El nombre llega ya colapsado.** Medido: con `filename="../../CON.txt"`,
`item.getFilename()` devuelve `_.._CON.txt`. Chromium quita los separadores y
desactiva el nombre de dispositivo por su cuenta. El saneado propio se queda
igualmente —es entrada de un tercero y no se delega en que otro la filtre—,
pero la prueba comprueba la **propiedad** —que sea un componente de ruta,
dentro del directorio— y no una cadena concreta, que ataría el resultado a la
versión de Chromium.

### Lo que rompió: soltar el lease no despinta nada

Cerrar el panel del navegador, o cambiar a Archivos, dejaba la página nativa
pintada encima de la aplicación. `detachSlot` olvidaba el lease en el
coordinador y ahí acababa: main dejaba de **admitir** geometría, pero nadie
tocaba la vista, que seguía compuesta con sus últimos bounds. Y no era sólo
verla: una vista nativa no la tapa ningún `z-index`, así que también se quedaba
con el input de ese rectángulo.

Retirar la presentación es una operación sobre la vista, no sobre el
coordinador. Ahora `detach` devuelve **de quién era** el slot y main esconde el
contenedor de esa sesión conservando la geometría —el §8.3 pide que ocultar no
cambie la página, y reescribir los bounds le cambiaría el viewport al
documento—. Capturar sigue funcionando escondida porque es `capturePage`, no
`Page.captureScreenshot` (§2).

El mismo agujero se abría sin desmontaje: una recarga del renderer no ejecuta
la limpieza de React, así que sus leases quedaban vivos sin nadie que los
soltara. Se retiran también en `did-navigate` de la ventana principal.

### Lo que rompió: nada que se despache en el loop de stdio puede esperar al host

El loop de stdio del Engine despacha en serie y la respuesta del host entra por
ese mismo loop. Un handler de protocolo que espere al host no se queda lento:
**se queda bloqueado para siempre**, y con él todo el canal de control —ni
Stop, ni cancelación, ni `engine.info`—.

Pasó con tres: `browser.view.get` contaba targets, `browser.control.set`
confirmaba la transición con el host y `session.close` esperaba a que el
contexto se dispusiera. El §5.4 lo dice del lado de las herramientas —«se
ejecutan en workers, no dentro del loop de stdio»—; esta es la misma regla
vista desde el Engine. Ahora `status()` es local, el control no viaja (main
monta la barrera al recibir la revisión confirmada, que es el orden del §7) y
el cierre avisa en segundo plano.

### Lo que rompió: un timeout del caller no liquida la mutación remota

Una operación emitida puede expirar o cancelarse en el worker mientras el host
todavía la está ejecutando. El resultado para la herramienta es
`outcome_unknown`, pero eso no autoriza a retirar su lease: conceder control al
usuario en ese intervalo dejaría dos controladores sobre la misma página.

El broker conserva la correlación abandonada hasta una reply tardía, un crash
del contexto o la pérdida del binding. El caller no revive ni recibe ese
resultado tardío; el settlement sólo libera la retención interna. Los leases de
una mutación semántica completa comparten esa contabilidad, de modo que un
click sigue cubierto desde la lectura de coordenadas hasta el último
`mouseReleased`. SETTLE-01…05 fijan las carreras reply/timeout/cancelación y el
traspaso de control; la prueba vertical pasa 24/24 pasos con este Engine.

### Observación temprana y buffers acotados

Cada target carga primero `about:blank`, instala una sola vez su listener del
debugger, habilita Runtime/Network y sólo entonces hace la primera navegación
real. Un detach repite attach + enable sobre el mismo listener. Los eventos se
sanean antes de guardarlos y cada buffer se limita a 500 entradas y 512 KiB;
no se conservan headers, cuerpos, object handles ni valores de cookies.

## 7. Lo que esta etapa no probó

Se listan para que nadie los dé por cubiertos:

- **Cobertura de entrada más allá del click y la tecla.** El §7 nombra wheel,
  IME, touch, drag/drop y menús. No hay medición específica de cada canal. El
  modo agent no presenta la vista en el rectángulo del panel, así que la
  exclusión no depende de interceptarlos uno por uno; falta validar esas rutas
  al ampliar la matriz de plataformas.
- **Otras plataformas.** `BARRIER-01` usa síntesis de entrada de Windows. El
  criterio de aceptación de la entrega E es Windows; macOS y Linux quedan por
  medir antes de afirmar nada allí.
- **Multi-monitor y cambio de monitor en caliente.** El barrido de escala fuerza
  el factor por proceso; mover la ventana entre monitores de distinta densidad
  no está medido.

## 8. Qué queda fijado para la entrega F

1. `View` contenedora con el rectángulo visible; `WebContentsView` hija con
   bounds lógicos. Un `webContents`, una vista (§6.2, [E3]).
2. Geometría en DIP; imágenes rotuladas con tamaño y escala.
3. El Engine arbitra las mutaciones y main arbitra la presentación física: en
   agent la vista queda a 1×1 con preview del mismo target; en user se restaura
   tras confirmación. Una herramienta mutable con el usuario al mando recibe
   `CONFLICT`, no se ejecuta ni reintenta.
4. Broker con allowlist semántica. `Target.*` y `Browser.*` no se exponen: la
   enumeración la sirve la registry.
5. Suscripción a `detach` del debugger como pérdida de control, con pendientes
   liquidados y sin reintento de mutaciones. Timeout y cancelación conservan la
   correlación hasta una reply tardía o una pérdida definitiva del recurso.
6. Ningún handler de protocolo espera al host. Lo que necesite al host va en
   un worker o en segundo plano.
7. Runtime/Network están activos antes de la primera navegación real; listeners
   y buffers tienen ciclo de vida y límites medidos.
8. Toasts se colocan fuera de superficies nativas o main recorta temporalmente
   la vista bajo su región.

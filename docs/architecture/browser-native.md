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

## 3. Input y arbitraje: la barrera es nativa, y no por descarte cómodo

Esta es la decisión que el §7 deja explícitamente a esta prueba: «Si no se
puede distinguir con garantías en la implementación escogida, canalizar el
control por una barrera nativa y decidirlo en la prueba vertical».

**Se puede bloquear al usuario. El problema es que las mismas barreras bloquean
al agente.**

| Mecanismo | ¿Cierra la entrada del usuario? | ¿Deja pasar la del agente por CDP? |
|---|---|---|
| `before-input-event` + `preventDefault` | Sí (`INPUT-01`: 1 → 0 keydown) | **No** (`INPUT-03`) |
| `before-mouse-event` + `preventDefault` | Sí (`INPUT-02`: 1 → 0 clicks) | **No** (`INPUT-03`) |
| `Input.setIgnoreInputEvents` | Sí (`INPUT-04`: 1 → 0) | **No** (`INPUT-04`: 0) |
| **Vista nativa superpuesta** | **Sí** (`BARRIER-01`) | **Sí**, no la toca |

`INPUT-03` está medido con línea base a los dos lados: sin barrera el click por
`Input.dispatchMouseEvent` llegó, con barrera no. `INPUT-04` igual, y su
`afterRelease` volvió a 1, lo que descarta que los ceros vinieran de una página
rota en vez del propio flag.

**Una superposición nativa sí para al usuario.** `BARRIER-01`, con entrada real
del sistema: sin barrera 1 click en la página; con barrera 0 en la página y 1 en
la superposición; al retirarla, 1 otra vez. No hay click-through y el click va a
quien está delante.

**Pero no está decidido que pueda estar montada mientras el agente trabaja.**
Las dos mediciones se contradicen y la discrepancia está **sin resolver**:

| Dónde | Barrera montada | ¿Llega el click del agente por CDP? |
|---|---|---|
| Sonda aislada, `BaseWindow` (`BARRIER-02`) | sí | **sí** (1 click) |
| Prueba vertical, ventana de la aplicación (`V2c`) | sí | **no** (0 clicks) |
| Prueba vertical, misma ventana, barrera retirada | no | **sí** (1 click) |

La segunda es la configuración que importa, así que manda: **el contexto no
nace con barrera**. Se monta sólo cuando alguien la pide explícitamente, hoy
para probar overlays y modales (§8.3). Mientras la discrepancia no se explique,
no se puede afirmar que la barrera separe las dos rutas.

Lo que la prueba vertical **sí** demuestra es que la exclusión funciona en el
Engine: con el usuario al mando, `browser.click` termina en `tool.failed` con
`CONFLICT` y no toca la página (`V5`). Eso cumple el §7 en lo que pide de
verdad —«una herramienta mutable debe recibir un estado de intervención/no
disponible, no ejecutarse a escondidas ni quedarse en retry infinito»— sin
depender de una barrera cuyo comportamiento no está fijado.

Queda abierto, y bloquea la entrega F: qué distingue las dos configuraciones
—`BaseWindow` frente a `BrowserWindow`, la URL de la superposición, el foco— y,
en consecuencia, qué impide al usuario tocar la página mientras una herramienta
ejecuta. Sin esa respuesta no se puede anunciar exclusión mutua.

Ese último punto exige una nota sobre el método. Las comprobaciones `INPUT-*`
usan `sendInputEvent`, que va dirigido a un webContents concreto y **se salta el
hit-testing**: sirve para medir intercepción, no geometría. Una barrera
superpuesta medida así habría salido buena sin demostrar nada. Por eso
`BARRIER-01` sintetiza un click de ratón del sistema
(`electron/probe/physicalClick.ps1`, que guarda y restaura la posición del
cursor).

**Consecuencia.** Se descarta alternar la barrera para cada acción del agente:
sería justo la «ventana global de bypass» que el §7 prohíbe, y además con
carrera.

Para el §8.3 y BR-07 la medición basta tal cual: un modal que invada el área
del browser se presenta como superficie nativa por encima y **no** deja pasar
clicks. Ahí no hay conflicto, porque mientras el modal está delante el agente
tampoco debe estar tocando la página. Ocultar la vista durante el overlay sigue
siendo válido; ya no es la única opción probada.

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
| V3 | Snapshot, llenar y click | `#result` pasa a `applied` con el valor que escribió la herramienta, leído del webContents |
| V4 | Screenshot con tamaño y target | bytes > 0 y el target es el de esta sesión |
| V5 | Control manual | con el usuario al mando `browser.click` acaba en `tool.failed` con `CONFLICT`; al devolver el control el agente lee la edición manual |
| V6 | Segunda sesión, misma URL | no ve su `localStorage` y su target no se resuelve desde el contexto ajeno |
| V7 | Recorte y overlay | el recorte baja a 200×140 y el viewport sigue en 760×560 |
| V8 | Matar el Engine | tras reiniciarlo el contador de clicks de la página no subió |

Dos comprobaciones más, que no son pasos del §3 pero sin las cuales los demás
no significan lo que parecen:

- **V2b** — el Engine sigue respondiendo a `engine.info` después de una
  operación de browser. Está por lo que se cuenta abajo.
- **V2c** — un click por CDP emitido desde main llega a la página. Sin este
  control, un fallo del paso 3 no distingue «el broker no funciona» de «esta
  vista no recibe input», y se depura el sitio equivocado.

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

## 7. Lo que esta etapa no probó

Se listan para que nadie los dé por cubiertos:

- **Cobertura de entrada más allá del click y la tecla.** El §7 nombra wheel,
  IME, touch, drag/drop y menús. `before-mouse-event` bloquea el click; del
  resto no hay medición. Mientras no la haya, la barrera nativa es el mecanismo
  —no la intercepción por evento—, que es precisamente lo que la hace la opción
  segura: no depende de enumerar canales.
- **Otras plataformas.** `BARRIER-01` usa síntesis de entrada de Windows. El
  criterio de aceptación de la entrega E es Windows; macOS y Linux quedan por
  medir antes de afirmar nada allí.
- **Multi-monitor y cambio de monitor en caliente.** El barrido de escala fuerza
  el factor por proceso; mover la ventana entre monitores de distinta densidad
  no está medido.
- **Carga y ciclos.** BR-13 (100 ciclos mostrar/ocultar/cerrar) y BR-14 (frames
  grandes contra Stop) son de la entrega F.

## 8. Qué queda fijado para la entrega F

1. `View` contenedora con el rectángulo visible; `WebContentsView` hija con
   bounds lógicos. Un `webContents`, una vista (§6.2, [E3]).
2. Geometría en DIP; imágenes rotuladas con tamaño y escala.
3. El arbitraje lo hace cumplir el Engine: una herramienta mutable con el
   usuario al mando recibe `CONFLICT`, no se ejecuta ni reintenta. La barrera
   nativa queda para overlays, y **no** montada por defecto.
4. Broker con allowlist semántica. `Target.*` y `Browser.*` no se exponen: la
   enumeración la sirve la registry.
5. Suscripción a `detach` del debugger como pérdida de control, con pendientes
   invalidados y sin reintento de mutaciones.
6. Ningún handler de protocolo espera al host. Lo que necesite al host va en
   un worker o en segundo plano.

Y una cosa que **no** queda fijada y hay que resolver antes de F: qué impide
que el usuario toque la página mientras una herramienta ejecuta (§3 de este
documento).

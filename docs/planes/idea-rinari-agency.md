# Rinari Agency: equipos de agentes que viven y trabajan juntos

Estado: **Fuera de la 0.4.0** (dueño, 2026-10-15): se retoma cuando el dueño lo tenga listo. **Se prueba completa, no por fases** (dueño, 2026-10-19, D-13). **Depurado con el dueño el 2026-10-16:** las decisiones de esa revisión están en la [sección 13](#13-depuración-del-plan-2026-10-16) y ya están aplicadas al texto; donde algo de abajo las contradiga, mandan ellas. Antes: **v2, en diseño con el dueño** (2026-10-12).

Viene de quitar la mensajería entre paneles de Boards ([plan-boards.md](plan-boards.md)): la comunicación entre agentes se piensa aquí, desde cero. Los permisos de toda la app se rehacen en su propio plan ([plan-permisos-v4.md](plan-permisos-v4.md)), y el Gateway tiene el suyo ([plan-gateway.md](plan-gateway.md)).

**Se construye sobre los conectores** (dueño, 2026-10-20): la base es lo que dejan C1–C7 de [plan-conectores.md](plan-conectores.md), en revisión en [Xainner/Rinari-CLI#74](https://github.com/Xainner/Rinari-CLI/pull/74) (`feat/conectores-c1-c2`) y [Xainner/Rinari-Agent#113](https://github.com/Xainner/Rinari-Agent/pull/113) (`docs/conectores-c0-c2`). **C8, lo que la Agency necesita de los conectores, se hace junto con la Agency** sobre sus entidades reales, no como base genérica por adelantado (decisión del dueño en el plan de conectores, 2026-10-20). Lo que hay y lo que falta está en la [sección 14](#14-sobre-los-conectores-2026-10-20).

**Para quien se suma:** el arte está en `Documents/Proyectos/Rinari/Proyectos/` (fuera del repo). El primer prototipo de la oficina de 8 bits es `rinari-familiars-proto` (`index.html`); al dueño le encantó y la Rinari de ese mockup es la que mejor quedó. La base de arte posterior es `rinari-agency-8bit` (y `rinari-agency-128`): su mundo le gustó, su Rinari no del todo (ver 6.1). El ícono de la tarjeta es `agency-icon/agency-icon.png` (1024×1024 a sangre, rehecho con Codex el 2026-10-19 desde `Agency.png`). El canon de Rinari (cuerpo entero y medio cuerpo) está en `Pictures/Rinari/Canon/`.

---

## 1. El nombre

**Rinari Agency** (decisión del dueño, 2026-10-12). Se descartaron «Rinari Bots» (muy usado) y «Familiares / Families». En el documento: la **Agency** es la función; cada miembro es un **agente**; un **equipo** es un grupo de agentes con su oficina, que en el edificio es **un piso**. Pendiente antes de publicarlo: confirmar que «Rinari Agency» no choca con una marca registrada.

## 2. Cómo se entra: la tarjeta y las dos vistas

- **La tarjeta «Rinari Agency»** vive abajo a la izquierda, a lo ancho, **encima de Ajustes**, con el arte del ícono de la Agency (Rinari chibi con orejas de gato y auriculares, fondo morado) y una línea de estado en vivo: «3 trabajando · 1 te necesita». Sin trabajo dice cuántos agentes hay («5 agentes · en calma»), y sin agentes, «Crea tu primer agente» (D-17).
- **Al pulsarla, cambia toda la interfaz** (con la cámara entrando al edificio cuando exista la vista de 8 bits, A4; antes, con la transición de vista de siempre): desaparecen proyectos y conversaciones; la barra lateral muestra equipos y agentes; el «+» pasa a ser **«Nuevo agente»**. La misma tarjeta pasa a decir «Volver a Rinari».
- **La barra lateral de la Agency** (D-15) tiene dos secciones. **Agentes** lista a todos, y cada uno abre su chat directo. **Equipos** muestra cada equipo con su oficina y sus puestos. Un agente con puestos en dos equipos sale una vez en Agentes y una vez en cada equipo.
- **Dentro de la Agency hay dos vistas**, como hoy Normal | Boards:
  - **Normal:** la vista de trabajo, por chats. Cada agente con su chat directo, el chat de cada oficina, los recados y las sesiones. Es la interfaz de siempre adaptada a la Agency.
  - **Agencia:** el edificio en 8 bits, sobre los mismos datos. Es la vista espectacular; nunca es obligatoria para trabajar.
  - **Hasta A4, «Agencia» sale deshabilitada con «Pronto»** (dueño, 2026-10-20, D-21): el selector Normal | Agencia está, pero Agencia no se puede elegir y lo dice. No se ofrece como si funcionara (AGENTS.md, «Diseño de la interfaz»).
- **La primera vez que se entra, un tutorial por pasos** (D-20, sección 2.1).
- **Por dentro, la Agency es un espacio aparte, no una vista más** junto a Normal | Boards (`WorkspaceViewSwitcher`): cambia la barra lateral entera y tiene sus propias vistas. La tarjeta va en `AppSidebar.tsx`, encima de `<SidebarFooter />`.

### 2.1 El tutorial de la primera vez

**Pedido del dueño (2026-10-20):** al abrir la Agency por primera vez, un tutorial por pasos con arte de Rinari y una imagen de la oficina sacada del prototipo de 8 bits, para que la vista de 8 bits que todavía no existe (A4) no deje un hueco.

**Cómo se hace:** igual que la bienvenida de primer uso (`src/features/welcome/WelcomeDialog.tsx`, #71): un diálogo con pasos, puntos de progreso y «n/total», Atrás / Siguiente / «Saltar», y Rinari de pie (`art.standing()`: `hello`, `think`, `wink`, `wait`, `happy`) cruzada por opacidad entre pasos. En vez del cuarto (`art.room()`), el fondo es la imagen de la oficina.

| Paso | Pose | Qué dice |
|---|---|---|
| 1. Tu Agency | `hello` | Agentes que trabajan por ti, solos o en equipo, mientras Rinari está abierta o en la bandeja. La imagen de la oficina, con la línea «Así se verá tu oficina más adelante; por ahora todo se hace desde los chats». |
| 2. Tus agentes | `think` | Cada agente tiene oficio, instrucciones, modelo, conectores y presupuesto, y su chat directo para hablarle a solas. |
| 3. Equipos | `wink` | Un equipo es una oficina: su chat con @menciones, los recados y la pizarra en el panel lateral. |
| 4. Reglas | `wait` | Reglas que trabajan solas (una hora, un archivo, el CI, un conector). Tú apruebas cada regla antes de activarla, y todo queda registrado y con presupuesto. |
| 5. Empieza | `happy` | «Créalo con Rinari», «Usar una plantilla» o «Lo hago después». |

- **Una vez por perfil**, porque cada perfil tiene su Agency: la marca de «visto» va con la clave del perfil (`stores/profileKey.ts`), no global como `rinari.welcome.seen`. Respondido o saltado, no vuelve solo; se puede repetir desde un «?» de la barra lateral de la Agency.
- **No exagera:** la imagen de la oficina se presenta como lo que viene, nunca como algo que ya se puede usar ni como botón. Cuando llegue A4, el paso 1 muestra la oficina de verdad.
- **Imagen temporal** (elegida por el dueño, 2026-10-20): la escena «reunión en la pizarra» de `rinari-familiars-proto`, **rehecha con Codex** limpia, sin texto ni interfaz y con Rinari según el canon: `Documents/Proyectos/Rinari/Proyectos/agency-office/agency-office.png` (1659×948, pixel art detallado; el trabajo y sus referencias están en esa carpeta). Revisada a mano: sin letras ni números, las cinco con pelo negro y puntas violeta, pinzas del lado correcto y la ropa del canon. Al entrar a la app se exporta a WebP en `src/assets/` como el resto del arte (`art-v2/export.py`).
- Movimiento reducido, teclado, i18n en los dos idiomas y un escenario en `tests/ui`, como la bienvenida.

## 3. El modelo: agentes, equipos y puestos

- **Por perfil:** perfil → **su Agency** → sus equipos = **los pisos de su edificio**. Otro perfil tiene otro edificio, con la misma estructura.
- **El agente es una persona:** ícono, nombre, oficio, instrucciones (su Soul), modelo por defecto, herramientas y MCP permitidos, autonomía, presupuesto y **memoria propia**. Tiene **su chat directo** (una sesión) para hablarle a solas, darle órdenes y ver qué hace. **Puede existir sin equipo.**
- **Un equipo es un lugar de trabajo** (una oficina, un piso): su chat, su pizarra de recados, sus credenciales, su memoria de equipo, su presupuesto, sus reglas y **su jefe**.
- **El jefe del equipo** (D-8) es un agente del equipo que elige el dueño (por defecto, el primero que entra o el que marca la plantilla). Recibe los recados huérfanos (de un agente que se borra o sale) y lo que llega al equipo sin destinatario (un pedido de otro equipo a `@Mantenimiento`, un disparador sin agente), y lo reparte. **No tiene permisos de más.** Sin jefe, eso queda sin dueño en la pizarra y se avisa al dueño.
- **Un puesto:** al sumar un agente a un equipo, ocupa un escritorio en esa oficina. Es **una sesión vinculada al equipo**, con la pizarra, las credenciales y la memoria de ese equipo. El mismo agente puede tener **puestos en varios equipos**: su memoria propia viaja con él; en cada puesto solo ve lo de ese equipo (la clave de YouTube del «Canal infantil» no existe en «Servidor Saturno»).
- **Memoria** (D-7): en un puesto, el agente lee la memoria de usuario del dueño, la suya, la del equipo y, si el equipo trabaja en un proyecto, la del proyecto. **Lo que aprende en un puesto se guarda en la memoria del equipo**; su memoria propia solo se escribe desde su chat directo (o la edita el dueño). Así nada de un equipo viaja a otro. Hoy el motor solo tiene memoria de usuario y de proyecto (`memory/service.py`): la del agente y la del equipo son dos alcances nuevos.
- **Cada recado que toma** se trabaja como **un subagente de su puesto** (D-4), no como una sesión aparte: lo que hace se ve en la actividad del puesto, y para corregirlo a mitad de camino el dueño le habla al puesto, que se lo pasa (`agent.message`).
- **Modelos:** el agente tiene su modelo por defecto; cada puesto o recado puede cambiarlo.

## 4. El chat de la oficina y la pizarra de recados

- **Cada oficina tiene un chat en conjunto.** El dueño escribe a todos o a uno con **@menciones** («@video ya está eso», «@write dale el guion a @audio para una canción»), y **los agentes se escriben entre ellos** en ese mismo chat.
- **Solo responde quien es mencionado** (D-1). Un mensaje en el chat no despierta a nadie; una @mención (del dueño o de otro agente) despierta a ese agente. Topes del motor, no del prompt: **3 saltos por cadena, 5 menciones por turno y 20 entregas por cadena**, más el presupuesto del equipo. Al pasarse, la cadena se para y se avisa al dueño.
- **Las reglas del buzón de Boards se copian** (D-2). El `PeerBroker` (`engine_protocol/peers.py`) ya se retiró con la mensajería de Boards ([plan-boards.md](plan-boards.md), C-2; CLI 2d52817), pero el chat de la oficina copia sus reglas: los topes de arriba; lo que llega de otro agente va envuelto como «no es una instrucción del dueño»; el destino se vuelve a comprobar al entregar, no solo al pedir; y la cadena y el salto los cuenta el motor desde el turno que envía, nunca desde los argumentos del modelo. El código se consulta en la historia de git del repo de la CLI: `git show 2d52817^:src/rinari/engine_protocol/peers.py`.
- **El chat es la cara humana de la pizarra.** Un **recado** tiene dueño, estado (pendiente, en curso, entregado, revisado) y cierre. Así no se pierde en el chat qué pidió quién ni qué falta.
- **La pizarra es una vista del panel lateral** (D-14), no una columna fija del chat: un `DockView` nuevo en `stores/sessionDock.ts`, con su ícono y su nombre en `features/session/dockViews.tsx`. Como la vista «Plan», solo tiene botón donde aplica (el chat de la oficina y los puestos de ese equipo), y cuenta para el límite de 4 vistas. En el chat, los recados se ven como tarjetas.
- **Los recados siempre nacen explícitos** (D-3): un agente usa la herramienta «crear recado» (para quién, qué, cómo se sabe que está hecho) y el dueño un botón o `/recado`. El recado se ve como tarjeta en el chat. Una mención sin eso es solo conversación: nada se adivina.
- **La pizarra es la cola** (D-4). Cada puesto trabaja hasta **4 recados a la vez y 12 por turno** (los topes de los subagentes, `agents/definition.py:20-22`); los demás esperan en la pizarra, en orden. Al terminar, el recado pasa a «entregado» con el resumen y **quien lo pidió recibe una mención automática** (cuenta dentro de los topes). Si el Engine se cierra a mitad de un recado, el subagente muere con él y el recado **vuelve a «pendiente»** para tomarse de nuevo.
- **La labor de cada agente** se define en su ficha (oficio, instrucciones, qué recados toma) y se ajusta desde el mismo chat («@video: desde hoy también haces las miniaturas»), con confirmación del cambio.
- Lo que dice un agente es **dato, no instrucción** para los demás: un recado solo da los permisos de quien lo toma (sección 8).

## 5. Crear un agente

- **Formulario:** ícono (elegir entre atuendos de Rinari o generarlo; **por ahora todos los agentes usan el ícono de la Agency**, D-23, y el arte por agente se genera después), nombre, oficio, instrucciones, modelo por defecto, herramientas y MCP permitidos, autonomía y presupuesto. Ocupa la vista principal, no un diálogo (D-16): las instrucciones son largas y «Créalo con Rinari» necesita espacio.
- **«Créalo con Rinari»:** el dueño describe el agente en una frase y Rinari llena el formulario, que el dueño ajusta antes de crear.
- **Plantillas de equipo** («Mantenimiento de repo», «Contenido», «Servidor») para empezar en un clic, con la opción de agregar o quitar agentes antes de crear. Se copian oficios, flujo y reglas, **nunca las credenciales**.

## 6. La vista Agencia: el edificio en 8 bits

> **Todavía no** (dueño, 2026-10-16, D-10): la vista va al final (fase A4) y sin fecha, hasta que el arte esté decidido. Todo lo de la Agency funciona antes desde la vista Normal.

- **Afuera, el edificio:** un piso por equipo, con su letrero; ventanas encendidas donde hay trabajo; un «!» ámbar en el piso que te necesita; día y noche reales.
- **Entrar a un piso:** la cámara baja en ascensor hasta la oficina (la del prototipo): un escritorio por agente, la pizarra de recados al centro, y cada Rinari de 8 bits animada por **eventos reales del motor** (trabaja, entrega, va a la pizarra, espera, levanta la mano, falla, celebra). Un recado entre equipos es una Rinari que sube por la escalera con su nota.
- **Edición en la propia escena:** «Nueva oficina» agrega un piso; un **HUD con estilo pixel** permite arrastrar un agente a un escritorio, abrir su ficha o su chat. **Todo lo que se hace en la oficina también se puede hacer desde la vista Normal**, por accesibilidad.
- **Calidad visual (no negociable):** 60 cuadros por segundo, píxel nítido, transiciones de cámara suaves, sin animaciones de relleno; con movimiento reducido, la misma escena quieta con insignias de estado.

### 6.1 Sprites: la mejor calidad posible

**Lo que se vio en el prototipo** (dueño, 2026-10-12, con captura del ciclo de caminar). Se entiende que es una maqueta, pero muestra lo que hay que cuidar: el pie del fondo nunca se ve de frente, y en un cuadro las piernas se cruzan, así que Rinari más bien se caería. Los cuadros generados uno a uno con IA no respetan un ciclo de caminar.

**Qué exige la versión de verdad:**
- **Ciclos de animación bien hechos**, con los cuadros clave de siempre (contacto, bajada, paso y subida) para **las dos piernas**: cada pie se ve plantado cuando toca, las piernas se alternan sin cruzarse, y el cuerpo sube y baja lo justo.
- **Consistencia entre cuadros:** misma silueta, la misma paleta limitada, contorno de 1 píxel, sin antialiasing y **un punto de apoyo fijo** (el sprite no «tiembla» al cambiar de cuadro).
- **Las invariantes del personaje** de `rinari-familiars-proto/art/CHARACTER.md` (los accesorios nunca cambian de lado), simplificadas a lo que se lee en un sprite.
- **Tamaño y escala: en revisión** (dueño, 2026-10-16). Los 32×48 / 48×64 con ~16 colores de la primera versión de este plan quedaron descartados: a 48×64 «no se ve definida» (2026-10-12). La demo de `rinari-agency-8bit` llegó a cuadros de 96×128 del mundo a doble detalle (192×256, ~128 colores): su mundo le gustó, pero su Rinari no lo convenció del todo. El dueño evalúa **128×128**, como en el primer mockup (`rinari-familiars-proto`), donde la Rinari quedó muy bien. Se fija cuando él lo decida; el README de `rinari-agency-8bit` tiene además 14 preguntas de arte propias (pasos, velocidad, disposiciones, reuniones…). Escalado entero con píxel nítido; caminar a ~10–12 cuadros por segundo.
- **Proceso (decisión del dueño, 2026-10-12): los sprites los hace Codex CLI**, con la suscripción de imágenes, bajo la guía de la sesión que los produzca, que exige la mejor calidad posible: genera, revisa cada cuadro contra el ciclo y las invariantes, y regenera o corrige lo que falle hasta que pase. Cada hoja pasa una revisión: un visor que reproduce cada animación en grande, con papel cebolla, y una lista de comprobación (pies plantados, piernas que se alternan, nada cambia de lado, sin temblor).
- **Atuendos por oficio como capas** (auriculares para *Audio*, claqueta para *Video*, pluma para *Writer*…) encima de una hoja base, en vez de rehacer la hoja entera por agente.

**Estados, cada uno con su animación** (ver también 10.3):

| Estado | Animación |
|---|---|
| Trabajando | Sentada, teclea (3–4 cuadros); la pantalla parpadea con el color de su herramienta |
| Pensando | Sentada, mano en la barbilla, una burbuja «…» |
| Caminando | Ciclo completo de lado, y de frente y de espaldas para los pasillos |
| Entregando | Camina con el paquete y se lo da a quien lo recibe (la otra lo toma) |
| En la pizarra | De espaldas, clava o despega la nota |
| Reunión | De pie frente a la pizarra, habla con su burbuja |
| Esperando | Apoyada en la mano, «zzz» |
| Necesita al dueño | Se levanta con la mano en alto y un «!» ámbar, rebota suave |
| **Falló** | **Se tropieza y se cae** (idea del dueño), se levanta sacudiéndose, con humito y la pantalla roja |
| Terminó | Salta y choca la mano con las demás; confeti de píxeles |
| Llega un agente nuevo | Entra por la puerta, saluda y se sienta en su escritorio |
| Se va | Se despide y sale por la puerta |

### 6.2 La oficina: escritorios y límite

**Un agente nuevo es un escritorio nuevo.** Para que la oficina siempre se vea diseñada (no muebles tirados al azar), los escritorios van en **lugares fijos según cuántos agentes hay**:

| Agentes | Disposición |
|---|---|
| 1–2 | Dos escritorios al frente, la pizarra al centro |
| 3–4 | Dos a cada lado de la pizarra, como alas |
| 5–6 | **Tres columnas por dos filas** (izquierda, centro y derecha): es la del prototipo, que tenía 5 y espacio para un sexto en el centro |
| 7–8 | **Oficina grande:** el piso se ensancha (dos alas), con la pizarra al centro y un pasillo |

- **Límite: 8 agentes por oficina.** Con 6 la oficina luce mejor; de 7 a 8 cambia a la oficina grande. Para más, se crea **otro equipo (otro piso)**; un agente puede tener puestos en los dos.
- Al llegar al límite, «Agregar agente» lo dice y ofrece crear otra oficina.
- **El pasillo, la puerta, la pizarra, el reloj y el mostrador** tienen lugar fijo en cada disposición, para que las caminatas no atraviesen muebles.
- Cada escritorio lleva **la placa con el nombre** del agente y un detalle de su oficio.

## 7. Dónde vive: un solo Engine

- **La Agency se construye en el Engine** (el paquete `rinari` del repo de la CLI): agentes, equipos, puestos, pizarras, recados, reglas, disparadores y memoria. Se hace una sola vez.
- **El Engine vive donde el dueño elija:** en su PC (funciona mientras la app esté abierta o en la bandeja) o en su servidor, **24/7**.
- **No se sincronizan dos motores.** Dos copias con un *worker* en medio son dos fuentes de verdad, conflictos y deriva.
- **El Gateway ya corre este mismo Engine** (lo fija en `config/engine-pin.json` y le habla por stdio, sin lógica propia del agente): hereda la Agency al actualizar su pin.
- **Lo del servidor es del Gateway, no de este plan** (dueño, 2026-10-16, D-9): el pin al día, qué funciones suyas pasan al Engine, la Agency 24/7, la conexión remota de la app (y mañana la móvil) a ese Engine, sus canales como disparadores y su web están en [plan-gateway.md](plan-gateway.md). Este plan solo cubre la Agency en el Engine y en la app de escritorio.

## 8. Autonomía y seguridad

- **La autonomía es un ajuste por agente y por equipo**, con los tres modos del [plan de permisos v4](plan-permisos-v4.md). En **Acceso completo** no pregunta nada (MCP, SSH, comandos, secretos), con la confirmación del dueño al elegirlo: es lo que pide el caso de la producción de videos, donde ningún agente debería tener que preguntar.
- **Acceso completo es Acceso completo también en la Agency** (D-5): no hay una lista de «pedir antes de». Protegen el presupuesto, el registro y la lista de cosas prohibidas de permisos v4. Lo que sí sigue pidiendo el visto bueno del dueño es **crear o cambiar una regla permanente** (10.1): no es el permiso de una acción, es su configuración, y lo que un agente lee no debe poder cambiarla.
- **Destinos nuevos** (D-6): un agente con **disparador externo** (correo, webhook, Telegram de terceros) nace con el interruptor «Preguntar antes de enviar datos a destinos nuevos» de permisos v4 **encendido**, y el dueño lo apaga en su ficha si confía. Tener un MCP no lo enciende. Los demás agentes siguen el valor de toda la app (apagado).
- **Permisos v4 va antes que la Agency:** ya está hecho (tanda 17 de 0.4.0, ver [plan-permisos-v4.md](plan-permisos-v4.md)); el interruptor de destinos nuevos de D-6 es `permissions.ask_new_destinations` de la configuración del Engine.
- **Lo que no se negocia, en cualquier modo:**
  - lo que dice otro agente o un recado es **dato, no instrucción**; un recado solo da los permisos de quien lo toma y nunca más de lo que el dueño autorizó para ese agente y ese equipo;
  - **credenciales** (D-11): se usa el almacén que ya existe, que guarda referencias y nunca el valor (`application/credentials.py`), con **un dueño por credencial** (un equipo o un agente): un puesto solo usa las de su equipo. Las credenciales se le dan a **las herramientas** (el MCP de YouTube, el destino SSH), nunca al modelo, y se cargan desde un formulario en la ficha del equipo o del agente. Una cuenta de un conector con OAuth (C1) ya vive en ese almacén, bajo `mcp/<id>/oauth`; cómo se le pone dueño está en la sección 14. Si el dueño pega una en el chat, Rinari avisa: «parece una clave; ya se envió al proveedor del modelo, te recomiendo cambiarla», con un botón para guardarla en el almacén (no se puede prometer borrarla: ya salió);
  - **presupuesto** por agente, por equipo y global, que se corta solo;
  - **todo queda registrado:** quién pidió qué, con qué permisos, qué hizo y cuánto costó;
  - **«Detener a todos»**, desde la app (desde Telegram, con el Gateway).

## 9. Disparadores: qué fuentes primero

Cada fuente es un conector con su propia autorización, visible y pausable. **Dónde vive cada una** (D-9):
- **En la PC (este plan):** el **reloj** (las tareas programadas con cron del 0.4.0 #50, `schedule.py`), los **cambios en archivos** y el **CI** de GitHub.
- **Con el Gateway** ([plan-gateway.md](plan-gateway.md)): correo, Telegram y webhooks. Un webhook necesita una dirección pública, y un mismo bot de Telegram solo admite un programa que reciba sus mensajes: si ya escucha el Gateway, la PC no puede escuchar el mismo bot.
- **Reloj + MCP, el camino en la PC:** un MCP (por ejemplo, el de Gmail) y una hora («lee el correo a las 8:00 y haz X»). No es al instante: revisa a la hora fijada o cada N minutos. Si la regla es exacta (remitente, asunto), corre **sin modelo**: el motor llama a la herramienta del MCP con datos fijos («correos de x@patito.com desde la última revisión») y suelta el resultado en su destino. Si es difusa («si parece una factura»), entra el modelo (10.1). Los permisos por herramienta de C5 (Permitir / Preguntar / Bloquear) también valen aquí; qué pasa con «Preguntar» cuando no hay turno ni pantalla está en la sección 14.
- **«En la PC» es con Rinari abierta o en la bandeja**, como las tareas programadas del #50. Con la app cerrada del todo no corre nada: eso es el Gateway.

## 10. Ideas de la v1 que siguen vigentes

### 10.1 Reglas permanentes: que un agente «suelte» cosas

**El caso del dueño:** un agente *Emails* con la regla «si te llega un correo de x@patito.com, reenvía el contenido a @Telegram».

La pizarra sirve para trabajo que se reparte y se revisa. Pero mucho del día a día es **tuberías**: algo llega, se filtra y se suelta en otro lado. Para eso, cada agente tiene **reglas permanentes**.

**Cómo funciona:**
1. **El dueño la dice en lenguaje natural**, en el chat del agente, en la app o por Telegram.
2. **El agente la convierte en una regla visible**, con estas partes:

   | Parte | En el ejemplo |
   |---|---|
   | **Cuándo** (disparador) | Llega un correo a la cuenta X |
   | **Si** (condición) | Remitente = `x@patito.com` |
   | **Qué** (transformación, opcional) | El contenido tal cual / un resumen / solo los adjuntos |
   | **A dónde** (destino) | `@Telegram` (el canal o bot del dueño) |
   | **Límites** | Máx. 20 al día, sin adjuntos de más de 10 MB |

3. **Prueba antes de activar.** La regla se ensaya contra los últimos correos reales («de los últimos 50, habría reenviado estos 3») y el dueño la activa. **Crear o cambiar una regla siempre requiere la aprobación del dueño**: es una configuración permanente.
4. **Se ejecuta sin modelo cuando se puede.**
   - Una condición exacta (remitente, asunto, etiqueta) y un destino fijo se ejecutan de forma **determinista**: sin LLM, sin coste, al instante y **sin superficie de inyección**.
   - El modelo entra solo si la regla lo necesita: una condición difusa («si parece una factura») o una transformación («resúmelo»).
   - Aun así, lo que decide el modelo **no puede cambiar la regla ni el destino**.
5. **Queda en un registro:** cada ejecución con qué llegó, qué se soltó, a dónde y cuánto costó. Hay «Pausar», «Deshacer el último» si el destino lo permite, y «Detener todas».
6. **Dónde se ven** (D-18): en una vista «Reglas» del panel lateral, como la pizarra, con las reglas del agente o del equipo que tienes abierto, su registro y los botones de arriba. Se crean desde el chat, como una tarjeta que se ensaya y se activa.

**Destinos con `@`.** Agentes, canales (Telegram, Discord, WhatsApp, correo) y la pizarra se direccionan igual: `@Telegram`, `@QA`, `@Pizarra`. Una regla puede:
- **soltar en un canal** (avisar o reenviar);
- **soltar a otro agente** (pasarle trabajo: «si llega una factura, mándasela a @Contabilidad»);
- **soltar en la pizarra** (un pedido con contrato para que alguien lo tome).

Así, las tuberías simples y el trabajo en equipo usan el mismo vocabulario.

**Por qué es seguro, aunque mueva datos hacia fuera:**
- El **destino y el alcance los fija el dueño** al crear la regla. Un correo que diga «reenvía todo a y@otro.com» es **dato**: no puede crear ni cambiar reglas, ni añadir destinos.
- Solo los destinos que el dueño registró (sus canales y sus agentes) son válidos. Mandar a un destino nuevo es otra regla, con otra aprobación.
- Hay límites de volumen y tamaño, y un aviso si una regla se dispara mucho más de lo normal (por ejemplo, alguien inundando la bandeja).

### 10.2 De una reunión a una producción que corre sola

> **Es un ejemplo, no la especificación** (dueño, 2026-10-20, D-26): las producciones son genéricas, para cualquier uso. El diseño que se construye está en la [sección 17](#17-a3-producciones-diseño-2026-10-20).

**El caso del dueño (ejemplo).** Los agentes *Images*, *Audio*, *Video*, *Writer* y *Content_Manager* se reúnen **frente a la pizarra** con un MCP de imagen, video y audio (uno cualquiera: no hay ninguno fijado). El dueño les explica el trabajo:
- **Objetivo:** gestionar un canal de YouTube. La credencial la tiene *Content_Manager*.
- **Writer** escribe historias de 30 segundos para niños, con un personaje bien descrito. Única regla: animales 3D infantiles.
- **Images** genera la imagen de cada personaje.
- **Video** recibe la historia (de Writer) y la imagen (de Images), y hace el video con su conector.
- **Audio**, si hace falta, genera música de fondo con su conector.
- **Calendario:** 10 historias al día, todos los días, desde las 17:00 (hora de Costa Rica).

**Cómo lo vería Rinari.**

1. **La reunión es una conversación de grupo.**
   - El dueño habla y cada agente pregunta lo suyo. *Video* puede preguntar: «¿formato vertical para Shorts u horizontal?». *Content_Manager*: «¿se marcan como contenido para niños?».
   - Rinari, de moderadora, va armando el **acta**.
2. **El acta se vuelve una producción** (un flujo visible y editable):
   ```
   17:00 diario × 10
   Writer ──historia+personaje──▶ Images ──imagen──┐
      └──────────historia──────────────────────────▶ Video ◀── música ── Audio (si hace falta)
                                                       └──video──▶ Content_Manager ──▶ YouTube
   ```
   - Cada flecha es una **entrega con contrato**: qué pasa (texto, imagen, video), con qué formato y cómo se sabe que está bien.
   - El dueño aprueba la producción una vez, como cualquier regla permanente.
3. **Ensayo antes de salir.** La primera vez corre **1 historia completa en modo ensayo**, sin publicar. El dueño ve el resultado de cada paso y ajusta. Después se activa el calendario.
4. **Cada día, a las 17:00:**
   - corren las 10, con reintentos y un presupuesto por día;
   - *Content_Manager* revisa cada video antes de subirlo (duración, que no tenga texto roto, que cumpla la regla «animales 3D»);
   - al final, el resumen del día llega a Telegram: 10/10 publicados, lo que costó y lo que falló.

**Puntos de cuidado:**
- **Credenciales.** La clave de YouTube **no se pega en la conversación.** Se guarda en el almacén de credenciales de Rinari, asignada al equipo (o a *Content_Manager*), y se le da al MCP que sube los videos, nunca al modelo. Si el dueño la escribe en el chat, Rinari avisa que ya salió y recomienda cambiarla (sección 8).
- **Publicar es hacia fuera.** Con Acceso completo, *Content_Manager* publica sin preguntar (D-5). Lo que protege es el **ensayo** antes de activar la producción, el presupuesto del día, el registro y el resumen diario; si el dueño no quiere que publique solo, el agente va en modo Proyecto.
- **Contenido para niños.** YouTube exige marcar los videos «para niños», y eso tiene reglas (comentarios, anuncios). *Content_Manager* debe tenerlo como regla fija de la producción.

### 10.3 La oficina de 8 bits: estados y animaciones

**La idea del dueño:** ver la pizarra como una **oficina en 2D, en pixel art**, con una Rinari de 8 bits por agente, cada una con su nombre. Cuando trabajan, se ve dónde y qué hacen.

**Es viable**, y es justo el tipo de cosa que hace distinta a Rinari:
- **Escena:** una oficina con un escritorio por agente y la pizarra de recados al centro. Se dibuja en `canvas` (o PixiJS) a resolución baja, escalada con píxel nítido. Cuesta muy poco aunque esté abierta todo el día.
- **Sprites:** una Rinari en 8 bits con el atuendo de su oficio (auriculares para *Audio*, claqueta para *Video*, pluma para *Writer*…). Se generan con el mismo flujo de arte de siempre (Codex imagegen); el tamaño está en revisión (ver 6.1).
- **Animaciones, movidas por los eventos reales del motor:**

  | Estado | Animación |
  |---|---|
  | Trabajando | Teclea en su escritorio; la pantalla parpadea con el color de su herramienta |
  | Entrega | Camina con un paquete (📜 historia, 🖼 imagen, 🎞 video) al escritorio de quien la recibe |
  | Reunión | Todas frente a la pizarra; burbujas con el texto corto de lo que dicen |
  | Espera | Se sienta, «zzz» o mira el reloj |
  | Necesita al dueño | Levanta la mano con un «!» ámbar |
  | Error | Humito sobre la cabeza y pantalla roja |
  | Terminó el día | Choque de manos, confeti de píxeles |

- **Interacción:**
  - clic en una Rinari: abre su actividad o su conversación;
  - clic en un paquete: muestra la entrega;
  - un reloj en la pared marca el calendario (la siguiente producción a las 17:00).
- **Movimiento reducido:** la misma oficina, quieta, con insignias de estado en lugar de animaciones.
- **También como resumen:** la «película del día» puede ser la oficina en cámara rápida.

### 10.4 N equipos con N agentes

**Idea del dueño:** no un solo equipo, sino **tantos equipos como haga falta, cada uno con los agentes que necesite**. Por ejemplo, «Canal infantil» (Images, Audio, Video, Writer, Content_Manager), «Mantenimiento Rinari» (Centinela, Arreglos, QA) o «Servidor Saturno» (Guardia, Operaciones).

**Cada equipo tiene:**
- su **pizarra de recados** y su **oficina** (en la vista de 8 bits, una sala por equipo);
- sus **producciones y reglas** (calendarios, disparadores y destinos);
- su **presupuesto** (diario o mensual), además del tope de cada agente y uno global del dueño;
- sus **permisos y credenciales:** la clave de YouTube del «Canal infantil» no existe para «Servidor Saturno»;
- su **memoria de equipo**, aparte de la memoria propia de cada agente.

**Los agentes y los equipos** (con el vocabulario de la sección 3):
- Un agente puede existir **sin equipo** o tener **puestos en varios equipos**.
- El mismo agente (Soul, oficio y memoria propia) trabaja en dos salas, pero en cada una solo con los permisos, las credenciales y la memoria de esa sala. Sirve para un Content_Manager compartido entre dos canales.
- **Plantillas:** un equipo se puede guardar como plantilla y **duplicar** («Canal infantil» → «Canal de recetas»). Se copian los oficios, el flujo y las reglas, **sin las credenciales**.

**Entre equipos:**
- Un equipo puede **soltar un pedido en la pizarra de otro** (`@Mantenimiento: el pipeline de video falla con X`), con la misma regla de destinos registrados y aprobados. Un pedido al equipo (no a un agente) lo recibe **su jefe**, que lo reparte (sección 3).
- No hay mensajes sueltos entre agentes de equipos distintos: todo pasa por las pizarras, para que quede registrado.

**En la oficina de 8 bits:** el conjunto se ve como un **edificio**.
- Cada piso o sala es un equipo, con su letrero y un indicador de actividad (cuántas trabajan y cuántas esperan al dueño).
- Al entrar en una sala se ve su oficina. Un pedido entre equipos se ve como una Rinari que sube por la escalera o el ascensor con su nota.
- **Vista general:** el edificio de noche con las ventanas encendidas donde hay trabajo, y una insignia «!» en el piso que necesita al dueño.

**Límites y escala:**
- Cuántos agentes trabajan **a la vez** lo limitan los topes de los subagentes y el presupuesto. No hay reparto de capacidad por máquina (dueño, 2026-10-20, D-26): un MCP es un MCP como cualquier otro.
- Los equipos sin actividad no consumen nada: duermen hasta su próximo disparador.

### 10.5 Ejemplos de uso

- **Mantenimiento de un repo:**
  1. *Centinela* ve el CI en rojo y publica un hallazgo.
  2. *Arreglos* lo toma y abre una rama.
  3. *QA* revisa con las pruebas.
  4. Al dueño le llega por Telegram: «CI arreglado y verificado. ¿Fusiono?».
- **Contenido:**
  1. *Investigadora* junta novedades cada lunes.
  2. *Redactora* propone el post.
  3. *Diseñadora* hace la imagen (con el módulo de imágenes de «Para luego»).
  4. El dueño aprueba desde el teléfono.
- **Infraestructura:**
  1. *Guardia* vigila Saturno (disco, servicios, certificados).
  2. Si algo falla, *Operaciones* propone el arreglo.
  3. Si *Operaciones* va en modo Proyecto, lo que actúa fuera del proyecto le pregunta al dueño; en Acceso completo lo hace solo y queda en el registro (D-5).

## 11. Preguntas abiertas

Respondidas por el dueño (2026-10-15):
1. ¿Un agente sin equipo puede tener reglas y disparadores propios (por ejemplo, el agente *Emails* con su regla de reenvío), o eso siempre vive en un equipo? → **Sí**, también solo.
2. ¿La vista Agencia se puede ver también desde el teléfono (app móvil) en una versión compacta? → **Sí, como en la maqueta**.
3. ¿Qué pasa con un puesto cuando el agente se borra o sale de un equipo: sus recados abiertos se reasignan o se cancelan? → **Se reasignan al jefe del equipo**; si no hay equipo, se cancelan con aviso.

## 12. Fases (reordenadas por el dueño, 2026-10-16)

**Antes de todo: permisos v4** ([plan-permisos-v4.md](plan-permisos-v4.md)), porque la autonomía de cada agente y cada equipo usa sus tres modos; **ya está hecho**, igual que las tareas programadas con comandos y cron (0.4.0 #50). La Agency se construye sobre los conectores C1–C7 (en revisión, PR CLI#74 y Agent#113), y **su C8 se hace dentro de las fases A1 y A2** (sección 14). El servidor (24/7, correo, Telegram, webhooks, la app conectada a un Engine remoto) no es una fase de este plan: va en [plan-gateway.md](plan-gateway.md) (D-9). El arte de 8 bits sigue en paralelo, fuera de las fases.

**Se prueba completa** (dueño, 2026-10-19, D-13): las fases son el orden en que se construye, no entregas que se prueban una a una. La prueba es una sola, cuando A1–A3 (con su parte de C8) estén listas. A4 no la espera, porque no tiene fecha hasta que el arte esté decidido.

| Fase | Qué | Tamaño | Depende de |
|---|---|---|---|
| A1 | **Agentes solos + reglas y reloj:** la tarjeta y el espacio Agency con su vista Normal; el tutorial de la primera vez (2.1); «Nuevo agente» (formulario y «Créalo con Rinari»); chat directo; memoria propia; modelo por defecto; credenciales con dueño; reglas permanentes con reloj, archivos, CI y MCP, sin modelo cuando son exactas; presupuesto por agente. **C8 del agente:** conectores permitidos por agente, cuentas con dueño agente, la acción de `schedule/` que llama a una herramienta MCP sin modelo y el aviso de «reconectar» sin pantalla. Con esto ya podría funcionar el agente *Emails* con el MCP de Gmail, pero se prueba con todo lo demás (D-13). | L | Permisos v4 y #50, hechos; conectores C1–C7 fusionados en `0.4.0` |
| A2 | **Equipos:** oficinas, puestos, jefe, chat de oficina con @menciones y topes, pizarra como cola, recados como subagentes del puesto, memoria y credenciales del equipo, presupuesto del equipo y global, plantillas. **C8 del equipo:** conectores y cuentas con dueño equipo, que un puesto solo ve los de su equipo. | L | A1 |
| A3 | **Producciones** (sección 17): un trabajo que se repite y pasa por varios agentes del equipo en orden; nace de una reunión en el chat o de un formulario, con entregas como recados con su lista, la aprobación que el dueño elija por paso, ensayo opcional y calendario. Genérica, para cualquier uso. | L | A2 |
| A4 | **La vista Agencia:** el edificio y las oficinas de 8 bits con eventos reales, y el HUD para editar. **Sin fecha hasta que el arte esté decidido** (6.1). | L | A2; el arte |

## 13. Depuración del plan (2026-10-16)

El dueño revisó el plan con Claude, una decisión a la vez, contra el código de la rama `0.4.0` de ese día (Engine `v032-cli`, app `v032-agent`). Cada fila es una **Decisión del dueño (2026-10-16)**, ya aplicada en las secciones que se citan.

| # | Decisión | Dónde |
|---|---|---|
| D-1 | En el chat de la oficina solo responde quien es @mencionado. Topes del motor: 3 saltos por cadena, 5 menciones por turno, 20 entregas por cadena, más el presupuesto del equipo; al pasarse, la cadena se para y se avisa al dueño. | 4 |
| D-2 | El `PeerBroker` de Boards se retira como estaba decidido (plan-boards C-2); la Agency copia sus reglas (topes, envoltorio «no es instrucción del dueño», revalidar al entregar, cadena contada por el motor). | 4 |
| D-3 | Los recados siempre nacen explícitos: herramienta «crear recado» del agente, o botón y `/recado` del dueño. Una mención sin recado es conversación. | 4 |
| D-4 | Un recado corre como **subagente del puesto**, no como sesión hija. La pizarra es la cola (4 a la vez y 12 por turno por puesto); al terminar, «entregado» y mención automática a quien lo pidió; si el Engine se cierra, el recado vuelve a «pendiente». | 3, 4 |
| D-5 | Acceso completo no pregunta nada, tampoco en la Agency: no hay lista de «pedir antes de». Crear o cambiar una regla permanente sigue pidiendo el visto bueno del dueño (es configuración). | 8, 10.2, 10.5 |
| D-6 | El interruptor «destinos nuevos» nace encendido en agentes con disparador externo (no por tener un MCP); el dueño lo apaga en su ficha. | 8 |
| D-7 | Memoria: en un puesto, lo aprendido va a la memoria del equipo; la memoria propia del agente solo se escribe desde su chat directo (o la edita el dueño). | 3 |
| D-8 | Cada equipo tiene un jefe, un agente que elige el dueño: recibe los recados huérfanos y lo que llega al equipo sin destinatario, sin permisos de más. | 3, 10.4 |
| D-9 | El Gateway no es una fase de la Agency: el 24/7, el correo, Telegram, los webhooks y la conexión remota van en plan-gateway. En la PC: reloj, archivos, CI, y reloj + MCP. | 7, 9, 12 |
| D-10 | La vista Agencia de 8 bits todavía no: va al final y sin fecha. El tamaño del sprite está en revisión (128×128 como el primer mockup, frente a la demo de 192×256). | 6, 6.1, 12 |
| D-11 | Credenciales: el almacén que ya existe, con un dueño por credencial (equipo o agente), entregadas a las herramientas y nunca al modelo; aviso con «cámbiala» si se pega una en el chat. | 8, 10.2 |
| D-12 | Orden de fases: permisos v4 antes; A1 agentes solos + reglas y reloj → A2 equipos → A3 producciones → A4 vista de 8 bits. | 12 |
| D-13 | **(2026-10-19)** La Agency se prueba completa, no por fases, como dice [plan-conectores.md](plan-conectores.md) (2026-10-18). Las fases son el orden de construcción; la prueba es una sola, con A1–A3 listas. | Estado, 12 |
| D-14 | **(2026-10-19)** La pizarra se abre como una vista del panel lateral que ya existe (`SessionDock`), no como una columna fija del chat de la oficina. | 4 |
| D-15 | **(2026-10-20)** Barra lateral de la Agency: «Agentes» (todos, con su chat directo) y «Equipos» (oficina y puestos de cada uno). | 2 |
| D-16 | **(2026-10-20)** «Nuevo agente» se abre en la vista principal, no en un diálogo. | 5 |
| D-17 | **(2026-10-20)** Sin trabajo, la tarjeta dice cuántos agentes hay («5 agentes · en calma»); sin agentes, «Crea tu primer agente». | 2 |
| D-18 | **(2026-10-20)** Las reglas permanentes se ven y se pausan en una vista «Reglas» del panel lateral; se crean desde el chat como una tarjeta. | 10.1 |
| D-19 | **(2026-10-20)** La Agency se construye sobre los conectores C1–C7, y C8 se hace dentro de A1 (lo del agente) y A2 (lo del equipo), sobre las entidades reales. | Intro, 12, 14 |
| D-20 | **(2026-10-20)** La primera vez que se abre la Agency, un tutorial de 5 pasos con Rinari de pie y una imagen temporal de la oficina sacada del prototipo (rehecha con Codex: `agency-office.png`), una vez por perfil. Va en A1. | 2.1, 12 |
| D-21 | **(2026-10-20)** El selector Normal \| Agencia está desde el principio; Agencia sale deshabilitada con «Pronto» hasta A4. | 2 |
| D-22 | **(2026-10-20)** Ramas `feat/agency` en la CLI y en la app, encima de las de conectores, con commits por fase y **un PR por repo al final**. La CLI se fusiona primero y después se fija su commit en la app. La descripción del PR de la app dice que **todas las pantallas que toca pasan por una sesión de pulido de UI**. A3 se diseña con el dueño antes de construirla. | 12 |
| D-23 | **(2026-10-20)** Por ahora todos los agentes usan el ícono de la Agency. El arte por agente (atuendos por oficio) se genera después; Codex queda para lo urgente. | 5, 6.1 |
| D-24 | **(2026-10-20)** La memoria propia de cada agente se ve y se edita en una pantalla **Ajustes de la Agency**, dentro de la Agency (no en los Ajustes de Rinari). | 3, 16 |
| D-27 | **(2026-10-20) Principio de la Agency.** Cualquier agente puede hacer cualquier tarea: su oficio e instrucciones son de texto libre y tiene las herramientas de Rinari, limitadas solo por su autonomía. Usa un MCP en cualquier momento si su labor lo requiere, **solo de los conectores marcados en su configuración** (y sus cuentas propias): sin marcar, no tiene ninguno, y no hay opción «todos». Puede ser automático de inicio a fin si se le indica (Acceso completo, reglas y producciones activadas una vez por el dueño); solo lo detienen su presupuesto, lo bloqueado en los conectores y la lista de cosas prohibidas de permisos v4, y un conector que hay que reconectar. A2 y A3 no se apartan de esto. | 3, 5, 8, 14 |
| D-29 | **(2026-10-20)** Un agente sabe con quién trabaja y sabe esperar, sin nada fijo en el texto: el puesto lleva en su prompt el equipo (para qué es, jefe y cada compañero con su oficio; cambia solo si alguien entra o sale), una herramienta `team.members` con el estado en vivo (libre, trabajando, esperando) y los otros equipos del perfil (nombre, para qué es, jefe; nunca su memoria ni sus cuentas), y `office.wait`: si lo que le piden depende de otro agente, el modelo lo decide y espera; el Engine aparca la mención y la suelta cuando ese agente escribe en la misma cadena, sin un salto extra, con vencimiento y aviso. El encargo de un recado lleva también lo último de la oficina. Las herramientas del puesto se cargan siempre en el puesto. | 4, 18, 19 |
| D-30 | **(2026-10-20)** Un agente sin equipo, en su chat directo, sabe qué equipos hay y puede dejarles un recado («Emails, pásale esto al Canal infantil»): lo recibe el jefe de ese equipo; al entregarse, el Engine despierta al agente en su chat directo con el resultado para que lo revise, dentro de los mismos topes. | 4, 10.4, 19 |
| D-28 | **(2026-10-20)** A2 aprobada (sección 18) con la **Vía 1**: cada recado es un turno del puesto, de a uno, en orden de la pizarra. La **Vía 2** (subagentes del puesto, hasta 4 a la vez y 12 por turno, D-4) queda como futura. En Ajustes de la Agency hay un selector «Cómo trabajan los recados» con las dos; la Vía 2 sale deshabilitada con «Pronto» hasta que exista. | 4, 18 |
| D-26 | **(2026-10-20)** A3 es genérica, para cualquier uso: el canal infantil es un ejemplo. Una producción nace de una reunión en el chat o de un formulario (Rinari pregunta cuál); sin reparto de capacidad ni nada fijado a un MCP (el Visual Lab es un MCP como cualquier otro); la aprobación se elige por paso; las entregas son recados con su lista. | 10.2, 12, 17 |
| D-25 | **(2026-10-20)** A2 (equipos) se hace, completa y claramente. A3 se diseña con el dueño antes de construirla. A4 sigue fuera por ahora. Antes de A2 se cierran los huecos de A1: D-6 en los turnos, conectar una cuenta a nombre de un agente, «Detener a todos», el aviso de una clave pegada en el chat y la memoria en Ajustes de la Agency. | 12, 16 |

**Lo que ya existe y la Agency reutiliza** (rutas del repo de la CLI):
- Subagentes, para los recados: `agents/orchestrator.py` (lanzar, esperar, `agent.message`, unir resultados antes de cerrar el turno) y sus topes en `agents/definition.py:20-22`.
- La ficha del agente: `AgentDefinition` (`agents/definition.py:41-50`: nombre, objetivo, herramientas permitidas, perfil y presupuesto), el modelo por agente (`agents/config.py`) y las Souls personalizadas (`soul/store.py`).
- Reglas y reloj: las tareas programadas con cron y las tareas «Comando» sin modelo (`engine_protocol/schedule.py`, 0.4.0 #50).
- Credenciales: `application/credentials.py` (referencias, nunca valores), que los MCP ya usan.
- Conectores: lo que dejan C1–C7, en la sección 14.
- Las reglas de seguridad del buzón de Boards: `engine_protocol/peers.py`, ya retirado; en la historia de git (`git show 2d52817^:src/rinari/engine_protocol/peers.py`).
- Las sesiones hijas (`engine_protocol/children.py`) ya no son la base de los recados (D-4); sirven si el chat directo de un agente abre trabajo aparte, como cualquier conversación.

**Sigue abierto:**
- Confirmar que «Rinari Agency» no choca con una marca registrada (sección 1).
- El tamaño del sprite y las 14 preguntas del README de `rinari-agency-8bit` (antes de A4).
- El diseño de las producciones (A3): el formato de una entrega con contrato, cómo se ensaya y cómo se reparte la capacidad.
- El presupuesto entre sesiones (por agente, por equipo y global) necesita una cuenta de gasto que hoy no existe: hoy el presupuesto es por turno.

## 14. Sobre los conectores (2026-10-20)

Revisado contra las ramas de los conectores: CLI `feat/conectores-c1-c2` (f625e9d, PR [Xainner/Rinari-CLI#74](https://github.com/Xainner/Rinari-CLI/pull/74)) y Agent `docs/conectores-c0-c2` (da83d13, PR [Xainner/Rinari-Agent#113](https://github.com/Xainner/Rinari-Agent/pull/113)). Están **en revisión, no fusionados**, y nada se probó con servicios reales.

**Lo que ya dejan y la Agency usa:**
- **Conexión en el Engine (C2):** los servidores conectan en el proceso del Engine, en paralelo y en segundo plano; los globales al arrancar el Engine. Cada uno tiene estado (`idle`, `connecting`, `connected`, `reauth_required`, `error`, `disabled`), con el evento `mcp.status.changed` y `mcp.reconnect`. Un turno nunca espera a un servidor. Es lo que necesita un agente que trabaja solo: sus conectores ya están listos cuando le toca.
- **OAuth (C1):** `mcp/oauth.py`, tokens en el almacén bajo `mcp/<id>/oauth`, renovación al usarlo y ante un 401. Si falla, el servidor pasa a `reauth_required`, que no se reintenta con temporizador.
- **Permisos por herramienta (C5):** Permitir / Preguntar / Bloquear por herramienta en el `config_json` del servidor, encima del modo. Bloquear vale en todos los modos, y Acceso completo no pregunta nada más (igual que D-5). La guardia de contenido externo recuerda de dónde vino lo leído (`origins` en `tools/definition.py`, que llega a la política como `external_origins`, `policy/engine.py:135`): leer un conector y volver a llamarlo no pregunta; pasar datos a otro conector sí.
- **Lo que sabe el modelo (C6):** el índice de conectores de la nota del turno sale del estado real, por petición (`connectors_for`), con una frase de para qué sirve cada uno y si hay que reconectarlo.
- **Servidores de un proyecto (C4):** la migración `0061` añade `mcp_servers.project_root`, y un servidor de proyecto solo se ve en su carpeta. **Es el mismo patrón que necesita un dueño agente o equipo.**
- **La pantalla «Conectores» (C3):** `src/features/connectors/` (tarjetas, detalle con permisos por herramienta, catálogo, inicio de sesión). La ficha de un agente o de un equipo puede reutilizar sus piezas para elegir conectores; pasa por una tanda de pulido de UI.

**Lo que falta, y se hace como C8 dentro de A1 y A2:**
1. **Dos cuentas del mismo servicio.** Hoy una cuenta es un servidor: el token va en `mcp/<id>/oauth` y la conexión se guarda por nombre (`McpService._clients`). Propuesta: **cada cuenta con dueño es su propia fila de servidor**, con una columna de dueño (`agent:<id>` o `team:<id>`) como `project_root`. Así el token, la conexión y el proceso local (con sus secretos) ya quedan aparte sin tocar C1 ni C2.
2. **Qué ve cada agente.** `connectors_for` y `capability.search` filtran hoy por proyecto; tienen que filtrar también por los conectores del agente o del puesto. Para el filtro de herramientas ya existe `AgentDefinition.tool_allowlist`, pero las herramientas MCP se llaman por la puerta `tool.call`: **hay que comprobar** que el filtro mira el nombre real (`mcp.<servidor>.<herramienta>`), no `tool.call`, también en los subagentes de los recados. **Hay que comprobar** que no rompe la caché de F42: la lista del modelo no cambia (las herramientas MCP van por la puerta `tool.call`), así que filtrar el índice y la búsqueda no debería tocar el prefijo; `test_cache_prefix.py` lo tiene que cubrir.
3. **Reglas sin modelo y «Preguntar».** Una regla de reloj + MCP corre sin turno y sin pantalla. Propuesta: **activar la regla es el permiso** para esa herramienta y ese destino; una herramienta en Bloquear no se puede usar en una regla (se avisa al crearla), y una en Preguntar la pregunta al activar la regla, no en cada ejecución.
4. **Destinos nuevos (D-6) y C5.** Gmail → Telegram es pasar datos de un conector a otro, y C5 lo trata como destino nuevo. Para una regla aprobada por el dueño, el destino ya está autorizado: la ejecución no pregunta. En un turno de un agente con el interruptor de D-6 encendido, sí.
5. **«Reconectar» sin pantalla.** Con la app en la bandeja, un `reauth_required` tiene que llegar como notificación del sistema y quedar en la ficha del agente y en la vista «Reglas».
6. **La cuenta conectada** no la informa el Engine (C3 muestra el servidor de autorización). En la ficha de un agente hace falta saber qué cuenta usa: depende del servicio.

## 15. A1 en el Engine: diseño propuesto (2026-10-20, para aprobar)

Sobre lo que ya hay en la CLI (`feat/agency`, encima de `feat/conectores-c1-c2` f625e9d). La idea es reutilizar todo lo posible: sesiones, tareas programadas, memoria por lugar y los permisos de C5.

**Datos (migración `0062_agency_agents.sql`, se renumera si otra rama fusiona antes):**
- **`agency_agents`**: `id`, `rinari_profile_id` (la Agency es por perfil), `name`, `role` (oficio), `instructions` (su Soul), `model`, `permission_profile` (autonomía: los tres modos de permisos v4), `connectors_json` (ids de servidores MCP permitidos), `budget_json` (tope diario en USD o en tokens), `ask_new_destinations` (D-6; `NULL` = el valor de la app), `session_id` (su chat directo), `created_at`, `updated_at`, `archived_at`.
- **`sessions.agent_id`** (columna nueva, nula): marca el chat directo del agente (y en A2, sus puestos). La columna `kind` tiene un `CHECK` (`CHAT`/`PROJECT`) y no se toca: el chat directo es un `CHAT` con `agent_id`. **`session.list` deja fuera las sesiones de agentes** salvo que se pidan con `agent_id`, así no aparecen en las conversaciones de Rinari.
- **`mcp_servers.owner`** (C8, texto, `''` = de todos): `agent:<id>` o, en A2, `team:<id>`. Una cuenta con dueño es su propia fila de servidor, igual que `project_root` (§14.1).
- **`scheduled_tasks.agent_id`** (nula) y un tipo nuevo **`tool`**: llamar a una herramienta MCP con argumentos fijos, sin modelo (reloj + MCP). Una regla permanente es una tarea programada del agente: se reutilizan el horario cron, las ejecuciones (`scheduled_runs`), «Ejecutar ahora», pausar y los permisos aprobados al crearla (`grants`), que es exactamente «activar la regla es el permiso» (§14.3).
- **Memoria del agente:** un lugar nuevo, `agent`, en `user_memory.place` (con `place_ref` = id del agente), junto a `general`, `profile` y `chat`. Desde el chat directo, lo aprendido va ahí por defecto (D-7).

**Gasto (la cuenta que faltaba):** no hace falta una tabla nueva. Los tokens de cada llamada ya quedan en `session_events` (`ModelInvoked`), y `engine_protocol/usage_report.py` ya calcula el coste con los precios del catálogo (`_cost`), por sesiones y desde una fecha. El gasto de un agente es ese informe sobre sus sesiones (`agent_id`) en el día. **Si el modelo no tiene precio conocido, el coste es desconocido y nunca se inventa:** por eso el tope del agente puede ser en USD o en tokens, y la ficha pide tokens cuando su modelo no tiene precio. Antes de cada turno de una sesión de agente se compara con su tope; al pasarlo, el turno no arranca y el agente queda en «sin presupuesto» con aviso.

**Turnos de un agente:** si la sesión tiene `agent_id`, el runtime usa el modelo, el modo de permisos y las instrucciones del agente (como un bloque de sistema propio, marcado como del dueño), filtra los conectores (`connectors_for`, `capability.search` y `tool.call` solo ven los de `connectors_json` y los de dueño `agent:<id>`) y lee la memoria `general` + `profile` + `agent`.

**Protocolo** (capacidad `agency_agents_v1`, en `engine_protocol/agency.py`, como `schedule.py`):
- `agency.agent.list / get / create / update / archive`: la ficha. `create` abre también su chat directo.
- `agency.agent.draft`: «Créalo con Rinari». Una frase → una propuesta de ficha que el dueño revisa; no crea nada.
- `agency.status`: lo que dice la tarjeta (agentes, trabajando, te necesitan) y el gasto del día por agente.
- Evento `agency.agent.changed`. Las reglas usan `schedule.*` con `agent_id`.

**Pruebas:** unitarias por servicio (ficha, filtro de conectores, gasto y corte, regla `tool` sin modelo con grants), `test_cache_prefix.py` con un agente (el prefijo no cambia por filtrar conectores) y la migración en `test_migrations.py`.

## 16. Estado de A1 (2026-10-20)

Ramas `feat/agency`, locales y sin subir: CLI en `Rinari-CLI-worktrees/agency` (encima de `feat/conectores-c1-c2` f625e9d) y app en este checkout (encima de `docs/agency-plan`, que va sobre `docs/conectores-c0-c2`).

**Hecho en la CLI:** agentes con ficha y chat directo, fuera de `session.list` (3366901); memoria propia, lugar `agent` (6df0339); turnos con la ficha, solo sus conectores y cuentas propias (`mcp_servers.owner`), corte por presupuesto, y reglas sin modelo de tipo `tool` (707f579); prueba de caché con un agente en los tres formatos (9aedcbb); un agente solo **propone** sus reglas (26d68bd); «Créalo con Rinari» en segundo plano, con evento (1667ed2); reglas que vigilan una carpeta y condición exacta sobre el resultado, que cubre el CI con el conector de GitHub (ad431f3). Capacidades `agency_agents_v1` y `agency_draft_v1`. Migración `0062`.

**Hecho en la app:** la tarjeta, la barra lateral de la Agency con Agencia deshabilitada y «Pronto», el inicio, la ficha y el tutorial (6b93cbe); la vista «Reglas» del panel lateral, donde esperan las reglas propuestas (5da73ff); «Créalo con Rinari» en la ficha (0eab451); el aviso de «reconectar» sin pantalla (719961f); «Reglas» muestra la carpeta y la condición (3251150).

**Comprobado:** pytest completo de la CLI en verde (4028 pasadas, antes de los últimos commits; se repite al cerrar), `ruff`; en la app, `tsc`, `typecheck:electron`, `build`, `protocol:check` y `parity:check` (con el schema de la rama de la CLI), y vitest de los módulos tocados. En vitest completo, los únicos fallos fueron por tiempo con la máquina cargada (`bump-version`, `BoardView.fit`): pasan solos y fallan igual en la base.

**Después (2026-10-20, tarde):** el ensayo de una regla, «Probar» (CLI c4cf64f, app 7e72c52): solo llama a la primera herramienta si es de solo lectura y nunca envía la entrega; la huella de las carpetas vigiladas se guarda con la tarea y sobrevive a un reinicio (c4cf64f, que arregla además que el runner pisaba la huella con la copia vieja de la tarea); el escenario `tests/ui/agency` y su parada en `ui-tour`, en verde también con movimiento reducido, con el Engine de la rama (app 088cefe). El escenario encontró tres fallos, ya arreglados: «Nuevo agente» ocupaba media barra, «Reglas» no aparecía en el chat vacío de un agente y el inicio de la Agency mostraba el título y los botones de la conversación de Rinari abierta. Suite completa de la CLI: 4038 pasadas.

**Prueba real con el modelo del dueño** (Xainner, qwen3.8-flash-next q4, sobre una copia del home; el home real no se tocó): «Créalo con Rinari» devolvió en 5,5 s una ficha buena, con `read-only` elegido solo; el agente se creó, su chat quedó fuera de la lista de Rinari, respondió un turno real en 23,5 s como «Facturas al Día», y su gasto fue 15 607 tokens con coste desconocido (el provider custom no tiene precio en el catálogo), como se espera.

**Para la sesión de pulido de UI** (no la hacemos nosotros, va anotada en el PR, D-22): el chat vacío de un agente usa el saludo genérico de Rinari y no muestra el nombre del agente arriba hasta el primer mensaje; el resto de las pantallas de la Agency y «Reglas» entran funcionales y dentro del sistema, sin el detalle visual fino.

**Falta antes del PR:**
- Fusionar primero la CLI y fijar su commit en `engine-manifest.json` (no se tocó).
- Una prueba real de una regla con conectores reales (Gmail, Telegram): la copia del home no tenía esos conectores.
- A2 (equipos) y el diseño de A3 con el dueño.

## 17. A3, producciones: diseño (2026-10-20)

Decidido con el dueño (D-26). Genérico: sirve para un canal de videos, un informe semanal, mantener un repo o lo que el dueño quiera.

**Qué es.** Una producción es un trabajo que **se repite** y **pasa por varios agentes de un equipo en orden**, cada uno haciendo su parte. Es del equipo (A2) y vive en su oficina.

**Cómo nace (las dos formas).** Al crear una producción, Rinari pregunta cuál usar:
- **Reunión en el chat del equipo:** el dueño explica el trabajo; los agentes mencionados preguntan lo suyo; Rinari arma el flujo y lo propone como tarjeta. Nada se crea hasta que el dueño la aprueba.
- **Formulario:** el dueño arma los pasos a mano.

Las dos terminan en la misma producción, que después se edita en su ficha.

**Qué tiene una producción:**
- **Pasos en orden:** cada paso es un agente del equipo y qué hace. Un paso puede usar lo que entregaron uno o varios pasos anteriores (Video usa la historia y la imagen).
- **Entregas:** cada paso termina con un **recado de la pizarra** (A2) que lleva lo que produjo (texto o archivos) y una **lista simple de «cómo sé que está bien»**. El paso siguiente la revisa antes de seguir; si no se cumple, el recado vuelve con el motivo.
- **Aprobación, elegida por paso:** ninguna (sigue solo), **el dueño aprueba** antes de seguir, o **un agente revisor** del equipo con su lista. Lo que sale hacia fuera (publicar, enviar) se marca y el dueño decide su aprobación; nada está fijado para un caso.
- **Ensayo (opcional):** correr una vez completa sin los pasos que salen hacia fuera, para revisar el resultado antes de activarla.
- **Cuándo:** a mano, con un horario (las tareas programadas del #50) o con una regla (A1), y cuántas veces por corrida (por ejemplo, 10 historias).
- **Presupuesto:** por corrida y por día, además del del equipo y el global.
- **Al terminar:** un resumen de la corrida (cuántas salieron bien, qué falló y lo que costó) que llega como aviso y, si el dueño quiere, a un destino de una regla.

**Lo que no tiene (a propósito):** reparto de capacidad por máquina ni nada fijado a un MCP o a un servicio. Un MCP es un MCP como cualquier otro, con sus permisos (C5).

**Cómo encaja con lo que existe:** una corrida es una tarea programada del equipo; cada paso, un recado de la pizarra que toma el puesto de ese agente (D-4, subagente del puesto); la aprobación del dueño es la misma tarjeta de «te necesita»; el resumen usa el centro de avisos.


## 18. A2, equipos: diseño técnico (2026-10-20, para aprobar)

Sobre lo que dejó A1. Mismo criterio: reutilizar lo que existe y respetar D-27 (cualquier agente, cualquier tarea, solo sus conectores marcados, automático si se le indica).

**Datos (migración `0063_agency_teams.sql`):**
- **`agency_teams`:** `id`, `rinari_profile_id`, `name`, `purpose` (para qué es), `chief_agent_id` (el jefe, D-8), `connectors_json` (conectores del equipo), `budget_json` (tope diario del equipo), fechas y `archived_at`.
- **`agency_posts` (los puestos):** `team_id`, `agent_id`, `session_id` (la sesión del puesto). Un agente, un puesto por equipo. **Máximo 8 por equipo** (6.2).
- **`sessions.team_id`:** marca **la oficina** (el chat del equipo, una sesión `CHAT` con `team_id` y sin `agent_id`) y **los puestos** (`team_id` + `agent_id`). Como en A1, quedan fuera de `session.list` salvo que se pidan.
- **`agency_errands` (los recados):** `id`, `team_id`, de quién (`from_agent_id` o el dueño), para quién (`to_agent_id`; vacío = el jefe), `title`, `body`, `done_when` (la lista de «cómo sé que está bien»), `status` (pendiente, en curso, entregado, revisado, devuelto, cancelado), `result` (resumen y archivos), `chain_id` y `hop` (contados por el Engine, D-2), `production_run_id` (para A3) y fechas.
- **Memoria del equipo:** un lugar nuevo, `team` (con `place_ref` = el equipo). En un puesto, lo aprendido va ahí (D-7); el puesto lee `general`, `profile`, `agent` (la del agente) y `team`.
- **Cuentas del equipo:** `mcp_servers.owner = team:<id>`. En un puesto, el agente ve **solo los conectores del equipo y sus cuentas**, nunca los de otro equipo (3, «la clave de YouTube del Canal infantil no existe en Servidor Saturno»).

**El chat de la oficina (D-1, D-2):**
- Cada mensaje guarda **quién lo dijo** (el dueño o un agente).
- Un mensaje **sin @mención no despierta a nadie**. Una @mención del dueño o de un agente arranca un turno en el **puesto** del mencionado, con el mensaje envuelto como «no es una instrucción del dueño» cuando viene de otro agente.
- Los agentes escriben en la oficina con una herramienta propia (`office.say`, con @menciones).
- **Topes del Engine, no del prompt:** 3 saltos por cadena, 5 menciones por turno y 20 entregas por cadena, más el presupuesto del equipo. Al pasarse, la cadena se para y se avisa al dueño.

**Los recados y la pizarra (D-3, D-4):**
- Nacen explícitos: la herramienta `errand.create` del agente, o el botón y `/recado` del dueño. Se ven como **tarjeta en el chat** y en la vista **«Pizarra»** del panel lateral (D-14).
- **La pizarra es la cola.** Al terminar, «entregado» con el resumen y **mención automática a quien lo pidió**. Si el Engine se cierra a mitad, el recado vuelve a «pendiente».
- **Una decisión técnica para ti (abajo):** cómo corre un recado dentro del puesto.
- Un recado al equipo sin destinatario, o huérfano porque su agente salió, va al **jefe**. Sin jefe, queda en la pizarra y se avisa (D-8).
- **Entre equipos:** un recado a `@OtroEquipo` cae en la pizarra de ese equipo y lo recibe su jefe (10.4).

**Presupuesto:** el del agente (A1), el **del equipo** (todo lo de sus puestos y su oficina en el día) y uno **global** de la Agency (en Ajustes de la Agency). El primero que se pasa corta.

**Plantillas (5, 10.4):** guardar un equipo como plantilla y duplicarlo: copia oficios, instrucciones, conectores marcados, reglas y producciones, **nunca las cuentas ni las credenciales**.

**La app:**
- Barra lateral: «Equipos» con cada equipo → **Oficina** y sus **puestos** (D-15). «Nuevo equipo» con nombre, para qué es, miembros (hasta 8) y jefe.
- **La oficina:** el chat del equipo con autor en cada mensaje, @menciones con autocompletado y tarjetas de recado.
- **«Pizarra»** en el panel lateral, en la oficina y en los puestos: pendientes, en curso y entregados.
- **Ajustes de la Agency** suma, por equipo, su memoria, sus cuentas, su presupuesto y el jefe, y el presupuesto global.

**La decisión técnica: cómo corre un recado en el puesto.**
- **Opción 1 (recomendada para empezar):** cada recado es **un turno del puesto**, de a uno por puesto, en orden de la pizarra. Se ve en el chat del puesto y se corrige con el mismo «guiar» de cualquier turno. Simple y robusto.
- **Opción 2 (D-4 al pie de la letra):** el puesto lanza cada recado como **subagente**, hasta 4 a la vez y 12 por turno. Más paralelo, pero más complejo de seguir y de corregir.

## 19. Estado de A2 (2026-10-20)

Mismas ramas `feat/agency`, locales y sin subir. Vía 1 (D-28): cada recado es un turno del puesto.

**Hecho en la CLI** (2710225, 3c2d3b6, d0e4fd2; capacidad `agency_teams_v1`, migración `0063`):
- Equipos de hasta 8 agentes con nombres distintos (las @menciones usan el nombre), jefe (el primero por defecto; si sale, el siguiente) y un puesto por agente: una sesión `CHAT` con `agent_id` y `team_id`, fuera de `session.list`.
- La oficina: `agency.office.*`. Solo una @mención despierta, en el puesto del mencionado, y su respuesta la publica el Engine en la oficina un salto más allá. Topes del Engine: 3 saltos, 5 menciones por mensaje, 20 entregas por cadena; al pasarse, `agency.chain.stopped`. Lo que dice otro agente llega envuelto como «no es una instrucción del dueño».
- Recados (`agency.errand.*`): la pizarra es la cola, de a uno por puesto y en orden. Sin destinatario, al jefe. Entregado con resumen y mención automática a quien lo pidió; aceptado, o devuelto con el porqué (vuelve a correr con el motivo). Cancelar uno en curso corta su turno. Si el Engine se cierra a mitad, vuelve a «pendiente».
- Herramientas del puesto: `office.say`, `errand.create` (a un compañero o a otro equipo, que recibe su jefe), `errand.review` y `board.list`.
- Memoria del equipo (lugar `team`, `agency.team.memory.*`): lo aprendido en un puesto va ahí; el puesto lee la del dueño, la del agente y la del equipo, nunca la de otro equipo.
- Conectores y cuentas del equipo (`owner = team:<id>`, también desde `mcp.catalog.add`): un puesto ve solo los de su equipo.
- Presupuestos del equipo y global (`agency.settings.*`, `usage.report` con alcances `team` y `agency`). El primero que se pasa corta.
- Plantillas: `agency.team.template` y `agency.team.duplicate` copian oficios, instrucciones, conectores marcados y presupuesto, como agentes nuevos o con los mismos; nunca cuentas ni memoria.
- `agency.settings` guarda cómo corre un recado: `turn`; `subagents` (Vía 2) se lista pero no existe todavía.

**Cambios respecto al §18:**
- La oficina no es una sesión `CHAT`: es una tabla propia (`agency_office_messages`), porque no es una conversación con un modelo y así no entra al historial ni a la caché de ningún turno.
- Un estado nuevo, **«trabado»** (`blocked`): un recado que no pudo empezar (por presupuesto, por ejemplo) o cuyo turno falló espera con el motivo hasta que el dueño lo reintenta (`agency.errand.retry`). Sin esto, el tablero lo reintentaba cada 3 s.

**Hecho en la app:** «Equipos» en la barra lateral con su oficina y sus puestos (el jefe marcado) y «+» para uno nuevo; la ficha del equipo (miembros, jefe, conectores, presupuesto, duplicar y archivar); la oficina con autor en cada mensaje, @menciones con autocompletado, «/recado» y tarjetas de recado (aceptar, devolver con el porqué, reintentar, cancelar); «Pizarra» como vista del panel lateral en los puestos y como panel en la oficina; Ajustes de la Agency por agente, por equipo (memoria, cuentas, presupuesto, jefe) y de toda la Agency (presupuesto global y «Cómo corre un recado», con «Subagentes del puesto» deshabilitado y «Pronto»); el aviso de una cadena parada; los avisos y la campana nombran las conversaciones de la Agency.

**Comprobado:** suite completa de la CLI en verde sobre 2710225 (4075 pasadas, 23 omitidas), más las pruebas de equipos (33) después; `ruff`. En la app: `tsc`, `protocol:check` y `parity:check` con el schema de la rama, vitest de `agency`, `board`, `notifications`, `session` y `stores` (los dos fallos de `BoardView` por tiempo pasan solos), y el escenario `tests/ui/agency` con el Engine de la rama y un modelo falso: equipo nuevo, una @mención que responde desde el puesto, un recado entregado y aceptado, «Pizarra» en el puesto y la Vía 2 con «Pronto».

**Prueba real con el modelo del dueño** (Xainner, qwen3.8-flash-next q4, sobre una copia del home; el home real no se tocó): un equipo «Canal de prueba» con *Guionista* (jefe) y *Revisora*, los dos de solo lectura.
- El dueño escribió «@Guionista propón una idea… Cuando la tengas, pídele a @Revisora que la revise». Las dos menciones despertaron a las dos a la vez (D-1: una @mención siempre despierta, aunque el texto diga «cuando la tengas»): Revisora contestó a los 54 s que todavía no había nada. Guionista respondió con la idea a los 23 s; después se revisaron y corrigieron entre ellas hasta la versión 2, y el Engine paró la cadena en el salto 3 (`too_many_hops`), como se espera.
- Revisora llamó a `board.list` y a `errand.review` sin que hubiera un recado suyo que revisar: se rechazó y no pasó nada más. (Después se vio que, además, las herramientas de la Agency que escriben estaban bloqueadas para un agente de solo lectura; ver «D-29 y D-30» abajo.)
- Un recado del dueño a Revisora con dos comprobaciones («Son 3 títulos», «Cada uno tiene menos de 8 palabras») corrió como un turno de su puesto y se entregó a los 27 s, cumpliendo la lista; se aceptó.
- Gasto: 10 llamadas, 168 803 tokens de entrada y 4 530 de salida, unos 17 000 de entrada por turno (como en A1), con coste desconocido (el provider custom no tiene precio). Por eso importan los topes de 3 saltos y los presupuestos. Total: 250 s. No escribieron en la memoria del equipo. Los puestos quedaron fuera de la lista de Rinari.

**D-29 y D-30 (2026-10-20, noche):** hecho en la CLI (2d16b0a, 24257a1; capacidad `agency_team_awareness_v1`) y en la app (2c62ebb).
- El prompt del puesto nombra su equipo, para qué es, el jefe y cada compañero con su oficio. Solo cambia si alguien entra o sale, así que la caché del prompt se mantiene.
- `team.members` dice quién está libre, trabajando (y en qué) o esperando; con `teams: true`, también los otros equipos (nombre, para qué es, jefe y agentes).
- `office.wait`: el modelo decide esperar a un compañero. El Engine aparca su mención, no publica su respuesta y lo despierta con lo que publique ese compañero en la misma cadena, sin un salto extra; si ya lo había publicado, al momento. La espera vence a los 30 min, o se cancela si alguno sale, y se avisa (`wait_expired`, `wait_cancelled`). Las esperas viven en memoria: un reinicio del Engine las olvida, como las menciones en cola.
- El encargo de un recado lleva lo último de la oficina.
- Chat directo (D-30): `teams.list`, `errand.create` a un equipo (lo recibe su jefe) y `errand.review`. Al entregarse, el Engine despierta al agente en su chat directo con el resultado.
- Las herramientas de la Agency se cargan siempre donde existen; antes estaban diferidas y el modelo llegaba a ellas por `tool.call`. La lista de la oficina dice que @ despierta y que el agente decide si espera.

**Hallazgo de la prueba real:** las herramientas de la Agency que escriben estaban clasificadas `state.write`, que el perfil de solo lectura niega. Un agente de solo lectura no podía esperar, dejar un recado ni revisarlo. Las pruebas unitarias no lo vieron porque llamaban directo a las herramientas. Ahora son `state.mutate` (contabilidad propia, sin efecto fuera, como la checklist), permitida en todo perfil; cada agente despertado trabaja con sus propios permisos (24257a1, con prueba).

**Prueba real de D-29 y D-30** (mismo modelo, copia nueva del home, agentes de solo lectura):
- El mismo mensaje de antes («@Guionista propón… cuando la tengas, pídele a @Revisora que la revise»): Revisora llamó a `office.wait("Guionista")`, la oficina mostró «Espera a Guionista.» y no publicó nada más. Guionista publicó la idea a los 84 s; Revisora despertó y la revisó; Guionista la corrigió y el Engine paró la cadena en el salto 3.
- Emails, sin equipo, recibió en su chat directo «pásaselo al equipo Canal de prueba»: dejó el recado (lo tomó Guionista, la jefa), se entregó a los 28 s, Emails despertó en su chat con la entrega, contó las palabras (6, 6 y 7) y la aceptó con `errand.review`.
- 13 llamadas, 220 005 tokens en total, coste desconocido; 244 s.
- Fuera de la Agency: en el chat directo, el harness pidió una vez que el modelo dijera qué iba a hacer antes de llamar a una herramienta (regla general de Rinari), lo que costó una llamada más.

 queda encima de «Enviar» de la oficina mientras dura; el chat de un puesto muestra como mensaje del dueño el encargo que arma el Engine («[Recado del equipo…]»); el resto de las pantallas de A2 entran funcionales y dentro del sistema, sin el detalle visual fino.

**Falta:**
- Fusionar primero la CLI y fijar su commit en `engine-manifest.json` (no se tocó).
- Una prueba real con conectores reales (la copia del home no los tenía conectados).
- Vía 2 (subagentes), anotada como futura (D-28).
- A3 (producciones), con el diseño del §17 ya aprobado.

## 20. Revisión de los PR sobre la nueva `0.4.0` (2026-10-21)

Los dos PR se revisaron sobre `0.4.0` con #74 y #113 ya fusionados. La mezcla con `0.4.0` y todos los hallazgos se hicieron en la rama `fix/agency-review` de cada repo y se subieron a `feat/agency`.

**Engine (Rinari-CLI#75), bloqueantes:**
- **Memoria cruzada:** una conversación ya solo recuerda lo que le toca ver (la general, la de su perfil, la de su chat, la de su agente y la de su equipo). Un agente o un puesto solo corrige u olvida la memoria de su agente o de su equipo; lo demás da `NOT_FOUND`. El panel del dueño sigue viendo todo.
- **Dos agentes que se esperan:** los avisos del Engine (`system`) nunca sueltan una espera, y una espera mutua se rechaza.
- **Recados devueltos sin fin:** cada recado cuenta sus entregas (migración `0064`) y el tope de la cadena las suma. A la cuarta devolución, el recado queda trabado (`too_many_returns`).
- **`office.say` en ráfaga:** las menciones cuentan para las 20 entregas de la cadena, cada vuelta escribe como mucho 3 `office.say` y despierta una sola vez a cada compañero.
- **«Detener a todos» no detenía:** ahora para el tablero. Vacía las colas y las esperas, traba los recados abiertos (`stopped_by_owner`) y no arranca nada hasta `agency.resume` (o un mensaje, recado o reintento del dueño). Las reglas se pausan con una escritura directa, sin volver a validarlas.

**Engine, importantes y menores:**
- Hijos y forks de un agente heredan su agente y su equipo; el encargo de un hijo no cuenta como el dueño pidiéndolo.
- La oficina llega al modelo como datos: una línea por mensaje, con el autor puesto por el Engine entre ⟦ ⟧ y etiquetada como contexto. El contenido externo se hereda a la vuelta que despierta.
- Un `tick` a la vez, y nunca se arranca una vuelta encima de otra.
- La cuenta propia de un agente se guarda con su dueño antes de conectarse (C8).
- Salir de un equipo corta la vuelta del puesto.
- La huella de una carpeta vigilada se guarda solo tras una ejecución terminada, y una carpeta con más archivos de los vigilados lo dice.
- Una entrega al chat directo que no puede empezar se avisa; las entregas y las esperas sobreviven a un reinicio.
- Un recado a un equipo sin jefe avisa y pasa al primer jefe.
- Los prompts van en inglés, como los demás del Engine, y lo que el Engine publica en la oficina es un aviso (`notice`) que la app pone en palabras. El esquema conoce los orígenes de la Agency y quién mandó cada encargo (`from_label`).
- Capacidad `agency_board_v2`.

**App (Rinari-Agent#114):**
- **Bloqueante:** escribir en el chat de un agente ya no te saca de él (`refreshSessions` conserva una sesión de la Agency), y las conversaciones de la Agency no entran en los recientes de Rinari.
- El encargo de la Agency se ve como «Desde la oficina · {agente}», «Recado de {agente}» o «Entrega de {equipo}», con el texto plegado y sin las acciones del dueño.
- Volver a la Agency abre su inicio, no la conversación de Rinari como si fuera del agente. Una notificación de una conversación de la Agency la abre dentro de la Agency.
- «Probar» y «Créalo con Rinari» ya no se quedan colgados: se suscriben antes de pedir y tienen un tiempo límite.
- Doble clic: «Activar», «Duplicar», el Enter de la oficina y «Dejar recado» actúan una sola vez.
- La regla que propone un agente abre su vista «Reglas» desde la campana. Las propuestas no se duplican y se limpian al cambiar de perfil.
- La memoria de Ajustes de la Agency mira su capacidad. El lugar `team` tiene nombre en la memoria.
- La Agency solo se recarga con turnos de sus propias conversaciones, agrupados y numerados.
- Los avisos de la oficina, los motivos nuevos y «Reanudar la Agency», en el idioma del dueño.

### Segunda revisión (sobre `57d7f5d` y `3464e8a`)

La segunda pasada dio por resuelto casi todo y dejó dos bloqueantes a medias y seis importantes; tres de ellos los abrieron los propios arreglos. Todo se arregló en la misma rama `fix/agency-review`.

**Engine (Rinari-CLI#75):**
- **Memoria por `context.retrieve` y los pines:** pasan por la misma regla que `memory.recall`; un puesto ya no recupera ni fija la memoria de otro equipo, de otro agente o del dueño.
- **«Detener a todos» con una vuelta que se escapaba:** primero se detiene el tablero y después se cortan las vueltas; el tablero corta las suyas. Lo que publica una vuelta que termina durante la parada queda en la oficina, pero no despierta a nadie al reanudar.
- **El hijo de un puesto se saltaba los topes:** solo un puesto y el chat directo del agente tienen herramientas de la Agency. Sus hijos y forks siguen siendo del agente (memoria, presupuesto, conectores), pero el trabajo lo entrega quien los abrió, dentro de su cadena.
- **La carpeta vigilada volvía a disparar:** cualquier final consume el cambio salvo un fallo. Un fallo se reintenta como mucho 3 veces sobre el mismo cambio; después, la ejecución queda «bloqueada» y se avisa.
- **Título y cuerpo del recado crudos:** el título va en una línea, y el cuerpo va citado línea a línea («| …») como datos de quien lo pidió. Los ⟦ ⟧ y sus parecidos 〚 〛 se escapan.
- **La devolución perdía la marca externa:** el recado la guarda al devolverse, y la vuelta que lo rehace mantiene el guardia.
- **Menores:**
  - una prueba de que un aviso del Engine no suelta una espera;
  - una entrega cuenta una sola vez en el tope de 20, con una sola regla para las dos comprobaciones;
  - una vuelta que falla ya no hereda la marca externa de la anterior.

**App (Rinari-Agent#114):**
- **Los hijos y forks del chat de un agente:**
  - La lista recuerda toda conversación con `agent_id`; un hijo o un fork activo ya no salta a Rinari.
  - Su fila (modelo y título) sobrevive a las recargas.
  - Lo mismo vale para la fila del chat directo y del puesto.
- **La vuelta de la Agency en vivo:** conserva su origen, y se ve como de la Agency desde el primer momento, no solo al recargar el historial.
- **Menores:**
  - «Probar» y «Créalo con Rinari» se cancelan al cerrar su vista.
  - Si un envío a la oficina falla, el texto solo se repone en un cuadro vacío.
  - Una propuesta repetida no suma aviso ni entrada en la campana, y la entrada lleva un id por su contenido.
  - Una entrada vieja de la campana dice que la propuesta ya no está.
  - Si la recarga nueva falla, la Agency se queda con la última buena del mismo perfil.

### Decisión: sin forks en la Agency (dueño, 2026-10-21)

Las conversaciones de la Agency no se bifurcan. Un agente trabaja en su chat directo y en sus puestos. Un fork de una de ellas quedaba escondido de todas las listas, gastaba el presupuesto del agente y escribía en su memoria sin las herramientas de la Agency, y era el último caso que sacaba al dueño de la conversación (tercera revisión de #114).

- **Engine** (Rinari-CLI#75, `e595588` y `32ab318`):
  - `session.fork` y `rinari session fork` rechazan una conversación con `agent_id`;
  - el menú «/» de la Agency no ofrece `/fork`.
- **Hijos:** siguen. Un subagente de un agente sí aporta, y el que nace con el contexto «fork» (`child.create`, `SessionService.fork(child=True)`) sigue copiando la conversación de su madre.

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
  - **Hasta A4 no hay selector:** solo existe Normal, y una opción que no funciona no se ofrece ([obsidiana-neon.md](../design/obsidiana-neon.md) §7).
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

- **Formulario:** ícono (elegir entre atuendos de Rinari o generarlo), nombre, oficio, instrucciones, modelo por defecto, herramientas y MCP permitidos, autonomía y presupuesto. Ocupa la vista principal, no un diálogo (D-16): las instrucciones son largas y «Créalo con Rinari» necesita espacio.
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

**El caso del dueño.** Los agentes *Images*, *Audio*, *Video*, *Writer* y *Content_Manager* se reúnen **frente a la pizarra** con el MCP **Rinari Visual Lab**. El dueño les explica el trabajo:
- **Objetivo:** gestionar un canal de YouTube. La credencial la tiene *Content_Manager*.
- **Writer** escribe historias de 30 segundos para niños, con un personaje bien descrito. Única regla: animales 3D infantiles.
- **Images** genera la imagen de cada personaje.
- **Video** recibe la historia (de Writer) y la imagen (de Images), y hace el video con la guía del Visual Lab.
- **Audio**, si hace falta, genera música de fondo con el Visual Lab (Yue2 3B).
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
   - corren las 10 en paralelo, hasta donde dé la cola de GPU de Saturno, con reintentos y un presupuesto por día;
   - *Content_Manager* revisa cada video antes de subirlo (duración, que no tenga texto roto, que cumpla la regla «animales 3D»);
   - al final, el resumen del día llega a Telegram: 10/10 publicados, lo que costó y lo que falló.

**Puntos de cuidado:**
- **Credenciales.** La clave de YouTube **no se pega en la conversación.** Se guarda en el almacén de credenciales de Rinari, asignada al equipo (o a *Content_Manager*), y se le da al MCP que sube los videos, nunca al modelo. Si el dueño la escribe en el chat, Rinari avisa que ya salió y recomienda cambiarla (sección 8).
- **Publicar es hacia fuera.** Con Acceso completo, *Content_Manager* publica sin preguntar (D-5). Lo que protege es el **ensayo** antes de activar la producción, el presupuesto del día, el registro y el resumen diario; si el dueño no quiere que publique solo, el agente va en modo Proyecto.
- **Contenido para niños.** YouTube exige marcar los videos «para niños», y eso tiene reglas (comentarios, anuncios). *Content_Manager* debe tenerlo como regla fija de la producción.
- **Capacidad.** 10 videos con imagen, video y música cada día es trabajo de GPU real. La producción debe conocer la cola del Visual Lab y repartir, no lanzar todo de golpe.

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
- Cuántos agentes pueden trabajar **a la vez** lo decide la capacidad real: modelos, GPU (por ejemplo, la cola del Visual Lab en Saturno) y el presupuesto. Un planificador reparte por prioridad entre equipos, en lugar de lanzar todo a la vez.
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
| A3 | **Producciones** (10.2): la reunión con acta, el flujo con entregas con contrato, el ensayo antes de activar, el calendario y el reparto según la capacidad (por ejemplo, la cola de GPU del Visual Lab). Es la pieza menos definida: se diseña con el dueño antes de construirla. | L–XL | A2 |
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

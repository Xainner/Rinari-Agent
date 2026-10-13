# Rinari Agency: equipos de agentes que viven y trabajan juntos

Estado: **v2, en diseño con el dueño** (2026-10-12). Pasa de idea a plan: las decisiones de abajo ya están tomadas; lo que sigue abierto está en «Preguntas abiertas».

Viene de quitar la mensajería entre paneles de Boards ([plan-boards.md](plan-boards.md)): la comunicación entre agentes se piensa aquí, desde cero. Los permisos de toda la app se rehacen en su propio plan ([plan-permisos-v4.md](plan-permisos-v4.md)), y el Gateway tiene el suyo ([plan-gateway.md](plan-gateway.md)).

**Para quien se suma:** el prototipo de la oficina de 8 bits está en `Documents/Proyectos/rinari-familiars-proto` (`index.html`); al dueño le encantó y es la referencia visual. La carpeta conserva el nombre provisional.

---

## 1. El nombre

**Rinari Agency** (decisión del dueño, 2026-10-12). Se descartaron «Rinari Bots» (muy usado) y «Familiares / Families». En el documento: la **Agency** es la función; cada miembro es un **agente**; un **equipo** es un grupo de agentes con su oficina, que en el edificio es **un piso**. Pendiente antes de publicarlo: confirmar que «Rinari Agency» no choca con una marca registrada.

## 2. Cómo se entra: la tarjeta y las dos vistas

- **La tarjeta «Rinari Agency»** vive abajo a la izquierda, a lo ancho, **encima de Ajustes**, con el arte del ícono de la Agency (Rinari chibi con orejas de gato y auriculares, fondo morado) y una línea de estado en vivo: «3 trabajando · 1 te necesita».
- **Al pulsarla, cambia toda la interfaz** (con la cámara entrando al edificio): desaparecen proyectos y conversaciones; la barra lateral muestra equipos y agentes; el «+» pasa a ser **«Nuevo agente»**. La misma tarjeta pasa a decir «Volver a Rinari».
- **Dentro de la Agency hay dos vistas**, como hoy Normal | Boards:
  - **Normal:** la vista de trabajo, por chats. Cada agente con su chat directo, el chat de cada oficina, los recados y las sesiones. Es la interfaz de siempre adaptada a la Agency.
  - **Agencia:** el edificio en 8 bits, sobre los mismos datos. Es la vista espectacular; nunca es obligatoria para trabajar.

## 3. El modelo: agentes, equipos y puestos

- **Por perfil:** perfil → **su Agency** → sus equipos = **los pisos de su edificio**. Otro perfil tiene otro edificio, con la misma estructura.
- **El agente es una persona:** ícono, nombre, oficio, instrucciones (su Soul), modelo por defecto, herramientas y MCP permitidos, autonomía, presupuesto y **memoria propia**. Tiene **su chat directo** (una sesión) para hablarle a solas, darle órdenes y ver qué hace. **Puede existir sin equipo.**
- **Un equipo es un lugar de trabajo** (una oficina, un piso): su chat, su pizarra de recados, sus credenciales, su memoria de equipo, su presupuesto y sus reglas.
- **Un puesto:** al sumar un agente a un equipo, ocupa un escritorio en esa oficina. Es **una sesión vinculada al equipo**, con la pizarra, las credenciales y la memoria de ese equipo. El mismo agente puede tener **puestos en varios equipos**: su memoria propia viaja con él; en cada puesto solo ve lo de ese equipo (la clave de YouTube del «Canal infantil» no existe en «Servidor Saturno»).
- **Cada recado que toma** se trabaja en una **sesión hija de su puesto** ([sesiones hijas](plan-sesiones-hijas.md)), que el dueño puede abrir.
- **Modelos:** el agente tiene su modelo por defecto; cada puesto o recado puede cambiarlo.

## 4. El chat de la oficina y la pizarra de recados

- **Cada oficina tiene un chat en conjunto.** El dueño escribe a todos o a uno con **@menciones** («@video ya está eso», «@write dale el guion a @audio para una canción»), y **los agentes se escriben entre ellos** en ese mismo chat.
- **El chat es la cara humana de la pizarra:** una mención **con una tarea** se convierte en un **recado** en la pizarra, con dueño, estado (pendiente, en curso, entregado, revisado) y cierre. Así no se pierde en el chat qué pidió quién ni qué falta. Una mención sin tarea es solo conversación.
- **La labor de cada agente** se define en su ficha (oficio, instrucciones, qué recados toma) y se ajusta desde el mismo chat («@video: desde hoy también haces las miniaturas»), con confirmación del cambio.
- Lo que dice un agente es **dato, no instrucción** para los demás: un recado solo da los permisos de quien lo toma (sección 8).

## 5. Crear un agente

- **Formulario:** ícono (elegir entre atuendos de Rinari o generarlo), nombre, oficio, instrucciones, modelo por defecto, herramientas y MCP permitidos, autonomía y presupuesto.
- **«Créalo con Rinari»:** el dueño describe el agente en una frase y Rinari llena el formulario, que el dueño ajusta antes de crear.
- **Plantillas de equipo** («Mantenimiento de repo», «Contenido», «Servidor») para empezar en un clic, con la opción de agregar o quitar agentes antes de crear. Se copian oficios, flujo y reglas, **nunca las credenciales**.

## 6. La vista Agencia: el edificio en 8 bits

- **Afuera, el edificio:** un piso por equipo, con su letrero; ventanas encendidas donde hay trabajo; un «!» ámbar en el piso que te necesita; día y noche reales.
- **Entrar a un piso:** la cámara baja en ascensor hasta la oficina (la del prototipo): un escritorio por agente, la pizarra de recados al centro, y cada Rinari de 8 bits animada por **eventos reales del motor** (trabaja, entrega, va a la pizarra, espera, levanta la mano, falla, celebra). Un recado entre equipos es una Rinari que sube por la escalera con su nota.
- **Edición en la propia escena:** «Nueva oficina» agrega un piso; un **HUD con estilo pixel** permite arrastrar un agente a un escritorio, abrir su ficha o su chat. **Todo lo que se hace en la oficina también se puede hacer desde la vista Normal**, por accesibilidad.
- **Calidad visual (no negociable):** 60 cuadros por segundo, píxel nítido, transiciones de cámara suaves, sin animaciones de relleno; con movimiento reducido, la misma escena quieta con insignias de estado.

## 7. Dónde vive: un solo Engine

- **La Agency se construye en el Engine** (el paquete `rinari` del repo de la CLI): agentes, equipos, puestos, pizarras, recados, reglas, disparadores y memoria. Se hace una sola vez.
- **El Engine vive donde el dueño elija:** en su PC (funciona mientras la app esté abierta o en la bandeja) o en su servidor, **24/7**.
- **No se sincronizan dos motores.** Dos copias con un *worker* en medio son dos fuentes de verdad, conflictos y deriva.
- **El Gateway ya corre este mismo Engine** (lo fija en `config/engine-pin.json` y le habla por stdio, sin lógica propia del agente): hereda la Agency al actualizar su pin. Lo que falta del lado del Gateway (pin al día, qué funciones suyas pasan al Engine, conexión remota y su web) está en [plan-gateway.md](plan-gateway.md).
- **La app de escritorio** (y mañana la móvil) podrá **conectarse a un Engine remoto**, el de su Gateway, para ver y manejar la Agency que corre en el servidor.

## 8. Autonomía y seguridad

- **La autonomía es un ajuste por agente y por equipo**, con los modos del [plan de permisos v4](plan-permisos-v4.md). El modo **Autónomo** no pregunta nada (MCP, SSH, comandos), con una confirmación del dueño al elegirlo: es lo que pide el caso de la producción de videos, donde ningún agente debería tener que preguntar.
- **Lo que no se negocia, en cualquier modo:**
  - lo que dice otro agente o un recado es **dato, no instrucción**; un recado solo da los permisos de quien lo toma y nunca más de lo que el dueño autorizó para ese agente y ese equipo;
  - las credenciales viven en el almacén de Rinari, asignadas a un equipo, y no se muestran en conversaciones;
  - **presupuesto** por agente, por equipo y global, que se corta solo;
  - **todo queda registrado:** quién pidió qué, con qué permisos, qué hizo y cuánto costó;
  - **«Detener a todos»**, desde la app o desde Telegram.

## 9. Disparadores: qué fuentes primero

Correo (IMAP / Gmail), Telegram, webhooks, archivos y CI, además del reloj. Cada fuente es un conector con su propia autorización, visible y pausable.

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
- **Credenciales.** La clave de YouTube **no se pega en la conversación.** Se guarda en el almacén de credenciales de Rinari, asignada a *Content_Manager*, y los demás agentes no la ven. Si el dueño la escribe en el chat, Rinari la mueve al almacén y la borra del mensaje.
- **Publicar es hacia fuera.** Al principio cada publicación pide aprobación (un toque en Telegram). Con un historial limpio, el dueño puede subir a *Content_Manager* a «publica solo» para esta producción.
- **Contenido para niños.** YouTube exige marcar los videos «para niños», y eso tiene reglas (comentarios, anuncios). *Content_Manager* debe tenerlo como regla fija de la producción.
- **Capacidad.** 10 videos con imagen, video y música cada día es trabajo de GPU real. La producción debe conocer la cola del Visual Lab y repartir, no lanzar todo de golpe.

### 10.3 La oficina de 8 bits: estados y animaciones

**La idea del dueño:** ver la pizarra como una **oficina en 2D, en pixel art**, con una Rinari de 8 bits por agente, cada una con su nombre. Cuando trabajan, se ve dónde y qué hacen.

**Es viable**, y es justo el tipo de cosa que hace distinta a Rinari:
- **Escena:** una oficina con un escritorio por agente y la pizarra de recados al centro. Se dibuja en `canvas` (o PixiJS) a resolución baja, escalada con píxel nítido. Cuesta muy poco aunque esté abierta todo el día.
- **Sprites:** una Rinari chibi en 8 bits con el atuendo de su oficio (auriculares para *Audio*, claqueta para *Video*, pluma para *Writer*…). Se generan con el mismo flujo de arte de siempre (Codex imagegen) y se pasan a hojas de sprites de 16×16 o 32×32 con paleta limitada.
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

**Los agentes y los equipos:**
- Un agente pertenece a **un equipo** por defecto.
- Puede **prestarse** a otro equipo: el mismo agente (Soul, oficio y memoria propia) trabaja en dos salas, pero en cada una solo con los permisos y credenciales de esa sala. Sirve para un Content_Manager compartido entre dos canales.
- **Plantillas:** un equipo se puede guardar como plantilla y **duplicar** («Canal infantil» → «Canal de recetas»). Se copian los oficios, el flujo y las reglas, **sin las credenciales**.

**Entre equipos:**
- Un equipo puede **soltar un pedido en la pizarra de otro** (`@Mantenimiento: el pipeline de video falla con X`), con la misma regla de destinos registrados y aprobados.
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
  3. Nada irreversible se hace sin el dueño.

## 11. Preguntas abiertas

1. ¿Un agente sin equipo puede tener reglas y disparadores propios (por ejemplo, el agente *Emails* con su regla de reenvío), o eso siempre vive en un equipo? Recomendado: sí, también solo.
2. ¿Cómo se generan los íconos y los sprites de 8 bits de cada agente nuevo? (Elegir de un banco de atuendos ya hecho, o generarlo con el flujo de arte de Rinari al crear el agente.)
3. ¿La vista Agencia se puede ver también desde el teléfono (app móvil) en una versión compacta?
4. ¿Qué pasa con un puesto cuando el agente se borra o sale de un equipo: sus recados abiertos se reasignan o se cancelan?

## 12. Fases propuestas

| Fase | Qué | Depende de |
|---|---|---|
| G0 | Pin del Gateway al día y orden de qué funciones pasan al Engine | [plan-gateway.md](plan-gateway.md) |
| A1 | **Agentes en solitario:** la tarjeta, el espacio Agency con su vista Normal, «Nuevo agente» (formulario y «Créalo con Rinari»), chat directo, memoria propia, modelo por defecto | Sesiones hijas A1 (linaje) |
| A2 | **Equipos:** oficinas, puestos, chat de oficina con @menciones, pizarra de recados, credenciales y memoria de equipo, plantillas | Permisos v4 (modos por agente y equipo) |
| A3 | **La vista Agencia:** el edificio y las oficinas de 8 bits con eventos reales, HUD para editar | A2 |
| A4 | **Reglas y disparadores:** reloj, correo, Telegram, webhooks, archivos y CI; reglas deterministas sin modelo | A2; tareas programadas con comandos (0.3.2 #50) |
| A5 | **24/7 en el servidor:** la Agency corriendo en el Engine del Gateway y la app conectada a ese Engine | Plan del Gateway (conexión remota) |

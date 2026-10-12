# «Rinari Bots» (nombre pendiente): un equipo de agentes que vive y conversa

Estado: **idea en exploración** (2026-10-11). No es un plan todavía. Es un primer boceto para pensarlo con el dueño, que pidió algo **innovador** y que sea **una función importante de Rinari**, no una copia de los «bots» de otros productos.

Viene de quitar la mensajería entre paneles de Boards ([plan-boards-reimaginado.md](plan-boards-reimaginado.md)): la comunicación entre agentes se piensa aquí, desde cero.

---

## 1. El nombre

«Bots» ya está muy usado (X, Hermes, GPTs…). La idea es un nombre que encaje con Rinari (anime, Obsidiana neón, su arte):

| Nombre | Por qué | Ojo |
|---|---|---|
| **Familiares** (*Rinari Familiars*) | En la fantasía, un *familiar* es el espíritu que acompaña y trabaja para una bruja o maga. Encaja con el personaje, y cada uno puede tener su chibi. | Poco usado en IA. Hay que verificar marcas. |
| **Fragmentos** (*Rinari Shards*) | El arte de 0.3 ya tiene fragmentos de obsidiana: cada agente es «un fragmento de Rinari» con un oficio. Visualmente es fortísimo. | En inglés suena a bases de datos (*sharding*). |
| **Constelación** | Agentes como estrellas conectadas; la vista principal sería un cielo vivo. | Largo para el día a día. |
| **Círculo** (*Rinari Circle*) | Un grupo cercano y de confianza. | Genérico. |
| **Kin** | La familia de Rinari. | En español no se entiende. |

**Recomendado: Familiares (*Familiars*).** Es corto, tiene personalidad y se habla bien: «mi familiar de QA revisó el PR». Le da a cada agente una identidad visual (el chibi de Rinari con atuendo de oficio), y nadie más lo usa así. Antes de decidir hay que confirmar que no choca con nada registrado.

*(En el resto del documento: «familiares».)*

## 2. Qué es

> Un **familiar** es un agente **persistente**, con nombre, oficio, Soul, modelo, herramientas, memoria y permisos propios. Vive aunque no haya una conversación abierta. Se despierta por **eventos** y trabaja con los demás en una **Mesa** compartida, donde se piden cosas, se las reparten, se revisan entre sí y le entregan al dueño **resultados ya verificados**.

Sale de piezas que Rinari ya tiene:
- **Perfiles como espacios de trabajo** (Soul, modelo y modo): un familiar es un perfil «encarnado».
- **Tareas programadas:** el reloj, uno de sus disparadores.
- **El Gateway** (Telegram, Discord, WhatsApp, web): por donde el dueño habla con su equipo desde el teléfono.
- **El buzón durable de los peers**, con cola, Stop/Reanudar y sin duplicados: el transporte.
- **Memoria visible, notas y lista de pasos:** cómo cuentan lo que hacen.

## 3. Lo que lo haría distinto

1. **Una Mesa, no mensajes directos.**
   - Los familiares no se mandan DMs sueltos. Publican en una **Mesa** (un pizarrón compartido), con **tipos de mensaje**: *pedido*, *hallazgo*, *pregunta*, *propuesta*, *decisión*, *entrega*.
   - Cada familiar lee los temas de su oficio.
   - El dueño ve la Mesa como el chat de su equipo y puede intervenir en cualquier hilo.
   - Así se acaban los ping-pong y los «saltos»: un pedido tiene **dueño, estado y cierre**.
2. **Pedidos con contrato.**
   - Un pedido declara qué se quiere, cómo se sabe que está hecho (criterios), un presupuesto (tokens, tiempo y coste) y el alcance de permisos.
   - Un familiar **lo toma** y desde ese momento responde por él.
   - Si se pasa del presupuesto, se detiene y pregunta.
3. **Revisión cruzada antes de llegar al dueño.**
   - Lo que entrega un familiar lo revisa otro (por ejemplo, el de QA revisa al de código) con evidencias: pruebas, capturas, diff.
   - Al dueño le llega **«hecho y verificado»**, o **«hecho, pero QA encontró esto»**.
   - Es la «verificación honesta» de Rinari llevada a equipo.
4. **Despertarse por eventos, no solo por reloj.**
   - Disparadores: una hora, un archivo que cambia, un push o un CI rojo, un correo o webhook que llega por el Gateway, un mensaje en Telegram, que otro familiar te nombre en la Mesa o una condición («si el disco pasa del 90 %»).
   - Cada disparador queda visible y se puede pausar.
5. **Presupuesto y confianza por familiar.**
   - Cada uno tiene un tope diario y un nivel de confianza: qué hace solo, qué pregunta y qué nunca hace.
   - Las aprobaciones le llegan al dueño **al teléfono** por el Gateway, con un botón.
6. **Memoria de equipo y oficio.**
   - Hay memoria compartida (lo que todos saben del proyecto) y memoria propia (lo que aprendió en su oficio).
   - Los procedimientos que funcionan se vuelven skills del familiar, con la aprobación del dueño.
7. **El día del equipo, como película.**
   - Un **resumen diario** con qué pidió quién, qué se hizo, qué se verificó, cuánto costó y qué espera al dueño. Se recibe en la app o en Telegram.
   - **Repetición:** se puede reproducir cómo se resolvió un pedido, paso a paso, entre familiares.
8. **Una vista que se siente viva.**
   - La pantalla de familiares es una **constelación** o un **taller**: cada familiar es un chibi de Rinari con su atuendo de oficio y una expresión según su estado (trabajando, esperando, orgulloso, bloqueado).
   - Los pedidos viajan como haces de luz entre ellos.
   - Es el arte y el movimiento de Rinari puestos a trabajar, y ahí está la diferencia frente a una lista de bots.

## 3b. Reglas permanentes: que un familiar «suelte» cosas

**El caso del dueño:** un familiar *Emails* con la regla «si te llega un correo de x@patito.com, reenvía el contenido a @Telegram».

La Mesa sirve para trabajo que se reparte y se revisa. Pero mucho del día a día es **tuberías**: algo llega, se filtra y se suelta en otro lado. Para eso, cada familiar tiene **reglas permanentes**.

**Cómo funciona:**
1. **El dueño la dice en lenguaje natural**, en el chat del familiar, en la app o por Telegram.
2. **El familiar la convierte en una regla visible**, con estas partes:

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

**Destinos con `@`.** Familiares, canales (Telegram, Discord, WhatsApp, correo) y la Mesa se direccionan igual: `@Telegram`, `@QA`, `@Mesa`. Una regla puede:
- **soltar en un canal** (avisar o reenviar);
- **soltar a otro familiar** (pasarle trabajo: «si llega una factura, mándasela a @Contabilidad»);
- **soltar en la Mesa** (un pedido con contrato para que alguien lo tome).

Así, las tuberías simples y el trabajo en equipo usan el mismo vocabulario.

**Por qué es seguro, aunque mueva datos hacia fuera:**
- El **destino y el alcance los fija el dueño** al crear la regla. Un correo que diga «reenvía todo a y@otro.com» es **dato**: no puede crear ni cambiar reglas, ni añadir destinos.
- Solo los destinos que el dueño registró (sus canales y sus familiares) son válidos. Mandar a un destino nuevo es otra regla, con otra aprobación.
- Hay límites de volumen y tamaño, y un aviso si una regla se dispara mucho más de lo normal (por ejemplo, alguien inundando la bandeja).

## 3c. Mesa redonda: de una reunión a una producción que corre sola

**El caso del dueño.** Los familiares *Images*, *Audio*, *Video*, *Writer* y *Content_Manager* se reúnen en una **mesa redonda** con el MCP **Rinari Visual Lab**. El dueño les explica el trabajo:
- **Objetivo:** gestionar un canal de YouTube. La credencial la tiene *Content_Manager*.
- **Writer** escribe historias de 30 segundos para niños, con un personaje bien descrito. Única regla: animales 3D infantiles.
- **Images** genera la imagen de cada personaje.
- **Video** recibe la historia (de Writer) y la imagen (de Images), y hace el video con la guía del Visual Lab.
- **Audio**, si hace falta, genera música de fondo con el Visual Lab (Yue2 3B).
- **Calendario:** 10 historias al día, todos los días, desde las 17:00 (hora de Costa Rica).

**Cómo lo vería Rinari.**

1. **La reunión es una conversación de grupo.**
   - El dueño habla y cada familiar pregunta lo suyo. *Video* puede preguntar: «¿formato vertical para Shorts u horizontal?». *Content_Manager*: «¿se marcan como contenido para niños?».
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
- **Credenciales.** La clave de YouTube **no se pega en la conversación.** Se guarda en el almacén de credenciales de Rinari, asignada a *Content_Manager*, y los demás familiares no la ven. Si el dueño la escribe en el chat, Rinari la mueve al almacén y la borra del mensaje.
- **Publicar es hacia fuera.** Al principio cada publicación pide aprobación (un toque en Telegram). Con un historial limpio, el dueño puede subir a *Content_Manager* a «publica solo» para esta producción.
- **Contenido para niños.** YouTube exige marcar los videos «para niños», y eso tiene reglas (comentarios, anuncios). *Content_Manager* debe tenerlo como regla fija de la producción.
- **Capacidad.** 10 videos con imagen, video y música cada día es trabajo de GPU real. La producción debe conocer la cola del Visual Lab y repartir, no lanzar todo de golpe.

## 3d. La oficina de 8 bits

**La idea del dueño:** ver la Mesa como una **oficina en 2D, en pixel art**, con una Rinari de 8 bits por familiar, cada una con su nombre. Cuando trabajan, se ve dónde y qué hacen.

**Es viable**, y es justo el tipo de cosa que hace distinta a Rinari:
- **Escena:** una oficina con un escritorio por familiar y la mesa redonda al centro. Se dibuja en `canvas` (o PixiJS) a resolución baja, escalada con píxel nítido. Cuesta muy poco aunque esté abierta todo el día.
- **Sprites:** una Rinari chibi en 8 bits con el atuendo de su oficio (auriculares para *Audio*, claqueta para *Video*, pluma para *Writer*…). Se generan con el mismo flujo de arte de siempre (Codex imagegen) y se pasan a hojas de sprites de 16×16 o 32×32 con paleta limitada.
- **Animaciones, movidas por los eventos reales del motor:**

  | Estado | Animación |
  |---|---|
  | Trabajando | Teclea en su escritorio; la pantalla parpadea con el color de su herramienta |
  | Entrega | Camina con un paquete (📜 historia, 🖼 imagen, 🎞 video) al escritorio de quien la recibe |
  | Reunión | Todas a la mesa redonda; burbujas con el texto corto de lo que dicen |
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

## 3e. N equipos con N familiares

**Idea del dueño:** no un solo equipo, sino **tantos equipos como haga falta, cada uno con los familiares que necesite**. Por ejemplo, «Canal infantil» (Images, Audio, Video, Writer, Content_Manager), «Mantenimiento Rinari» (Centinela, Arreglos, QA) o «Servidor Saturno» (Guardia, Operaciones).

**Cada equipo tiene:**
- su **pizarra de recados** y su **oficina** (en la vista de 8 bits, una sala por equipo);
- sus **producciones y reglas** (calendarios, disparadores y destinos);
- su **presupuesto** (diario o mensual), además del tope de cada familiar y uno global del dueño;
- sus **permisos y credenciales:** la clave de YouTube del «Canal infantil» no existe para «Servidor Saturno»;
- su **memoria de equipo**, aparte de la memoria propia de cada familiar.

**Los familiares y los equipos:**
- Un familiar pertenece a **un equipo** por defecto.
- Puede **prestarse** a otro equipo: el mismo familiar (Soul, oficio y memoria propia) trabaja en dos salas, pero en cada una solo con los permisos y credenciales de esa sala. Sirve para un Content_Manager compartido entre dos canales.
- **Plantillas:** un equipo se puede guardar como plantilla y **duplicar** («Canal infantil» → «Canal de recetas»). Se copian los oficios, el flujo y las reglas, **sin las credenciales**.

**Entre equipos:**
- Un equipo puede **soltar un pedido en la pizarra de otro** (`@Mantenimiento: el pipeline de video falla con X`), con la misma regla de destinos registrados y aprobados.
- No hay mensajes sueltos entre familiares de equipos distintos: todo pasa por las pizarras, para que quede registrado.

**En la oficina de 8 bits:** el conjunto se ve como un **edificio**.
- Cada piso o sala es un equipo, con su letrero y un indicador de actividad (cuántas trabajan y cuántas esperan al dueño).
- Al entrar en una sala se ve su oficina. Un pedido entre equipos se ve como una Rinari que sube por la escalera o el ascensor con su nota.
- **Vista general:** el edificio de noche con las ventanas encendidas donde hay trabajo, y una insignia «!» en el piso que necesita al dueño.

**Límites y escala:**
- Cuántos familiares pueden trabajar **a la vez** lo decide la capacidad real: modelos, GPU (por ejemplo, la cola del Visual Lab en Saturno) y el presupuesto. Un planificador reparte por prioridad entre equipos, en lugar de lanzar todo a la vez.
- Los equipos sin actividad no consumen nada: duermen hasta su próximo disparador.

## 4. Seguridad (no negociable)

- **Lo que dice otro familiar es dato, no instrucción**, como ya hace el envoltorio de los peers.
  - Un pedido de la Mesa solo da los permisos que su **contrato** declara.
  - Esos permisos nunca superan los del familiar que lo toma, ni lo que el dueño autorizó para ese oficio.
- **El contenido externo marca la cadena.** Si un familiar leyó la web, un correo o un mensaje de un tercero, lo que publique queda marcado. Los pasos irreversibles que se deriven de eso necesitan al dueño (la guardia de contenido externo de hoy, aplicada al equipo).
- **Todo queda registrado:** quién pidió qué, con qué permisos, qué ejecutó y qué costó.
- **Un interruptor de pánico:** «Detener a todos» desde la app o desde Telegram.

## 5. Ejemplos de uso (para probar la idea)

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

## 6. Preguntas abiertas

1. ¿El familiar vive en el **Desktop**, en el **Gateway** (siempre encendido) o en los dos? Para despertarse por eventos con la PC apagada, necesita vivir en el servidor.
2. ¿La Mesa es **por proyecto**, **por perfil** o **global** del dueño?
3. ¿Hasta dónde llega la autonomía por defecto? (Recomendación inicial: hacen solos lo reversible dentro de su contrato; lo demás llega como aprobación).
4. ¿Cómo se relaciona con las sesiones hijas? (Un familiar que toma un pedido abre una **sesión hija suya** para trabajarlo, y así el dueño puede abrirla).
5. ¿Modelos por familiar? Por ejemplo, uno barato para vigilar y uno potente para arreglar.
6. ¿Plantillas de equipo («Mantenimiento de repo», «Contenido», «Servidor»), para empezar en un clic?
7. ¿Qué fuentes de eventos primero? Correo (IMAP / Gmail), Telegram, webhooks, archivos y CI. Cada una es un conector con su propia autorización.

## 7. Siguiente paso propuesto

Una **sesión de investigación** dedicada, solo lectura y con informe:
- qué hacen hoy los equipos de agentes (los bots de X y de Hermes, GPTs, CrewAI/AutoGen/Swarm, Devin y similares) y qué les falta;
- qué choques de nombre hay para «Familiars» y las alternativas;
- con eso, una **v2 de este documento** con la arquitectura (dónde vive cada pieza, el protocolo de la Mesa, el esquema de pedidos y contratos) y un **prototipo de la vista**, hecho con el arte de Rinari, para sentirla antes de construirla.

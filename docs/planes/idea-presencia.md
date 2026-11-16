# Presencia: una sola Rinari, siempre encendida

Estado: **en construcción** (2026-11-16). Hecho en la rama `feat/presencia` de los dos repositorios, sin fusionar: lo de la sección 12. Diseñado con el dueño el 2026-11-11. Las decisiones de abajo son del dueño en esa conversación; lo marcado «por verificar» no se ha comprobado contra el código.

Se relaciona con [idea-rinari-agency.md](idea-rinari-agency.md) (ella queda por encima de la Agency), [plan-gateway.md](plan-gateway.md) (donde reside cuando hay servidor), [plan-permisos-v4.md](plan-permisos-v4.md) y [plan-sesiones-hijas.md](plan-sesiones-hijas.md).

---

## 1. Qué es

Un modo, inspirado en JARVIS y en los asistentes compañeros: **una sola conversación con Rinari que nunca termina**. No es un chat más de la lista. Es la Rinari que ve todos los chats, los lanza, los revisa, programa cosas, actúa sola y avisa.

- **Una por instalación.** No se crean varias, no tiene sesiones hijas. Sí usa subagentes.
- **Es un modo que se activa en Ajustes.** Con el modo apagado, la app es la de hoy.
- **Los chats normales no cambian**: siguen siendo sesiones con su proyecto, su modelo y sus permisos. Ella los ve y los maneja.
- **Se llama Presencia** (Presence en inglés; RC-14). Es el nombre del modo en Ajustes y en la documentación; al hablar con ella es Rinari a secas.

## 2. Decisiones del dueño (2026-11-11)

| # | Tema | Decisión |
|---|---|---|
| RC-1 | Residencia | En el Gateway cuando la app está conectada a uno; si no, en el Engine local. Nunca dos a la vez. |
| RC-2 | Permisos | Acceso total a lo del dueño. Lo irreversible hacia afuera pide confirmación por defecto; es un ajuste que se puede quitar. |
| RC-3 | Identidad | Es Rinari, una sola. Es un modo que vive en el Home, no reemplaza la app. |
| RC-4 | Autonomía | Actúa sola desde el principio, no solo avisa. |
| RC-5 | Despertares | Solo eventos y encargos. Sin pulso periódico por defecto. |
| RC-6 | Presupuesto | Es un ajuste; por defecto sin límite. |
| RC-7 | Agency | Queda por encima: consulta cualquier Agency y le da órdenes al jefe. |
| RC-8 | Soul | El soul por defecto y los niveles de intensidad, sin cambios. Se añade un registro humano solo para esta conversación. |
| RC-9 | Nivel Mínimo | Sigue hablando humana y cálida; el nivel regula el personaje, no lo humana que es. |
| RC-10 | Voz | Después, cuando haya un full duplex local compatible con OpenAI o créditos de GPT-Live para probar. |
| RC-11 | Mención | `@Rinari` desde la caja de cualquier chat entra en el plan. |
| RC-12 | Eventos | La autonomía escucha todo evento que el Engine ya emite y los permisos dejen (sección 5.2). |
| RC-14 | Nombre | Presencia (Presence). |
| RC-15 | Atajo global | `Ctrl+Shift+Espacio`, configurable. |
| RC-16 | Mudanza | Como en la sección 7.1, con una vía de recuperación si el servidor no vuelve. |
| RC-17 | Usar la PC desde el servidor | Es un ajuste: con él activo y la app conectada, usa la PC directamente (sección 7.2). |
| RC-18 | Funciones | Entran todas las de la sección 4. |
| RC-13 | Guardia de contenido externo | Es un ajuste, activo por defecto, igual que la confirmación de lo irreversible. |

## 3. Dónde vive en la interfaz

Una sola conversación con cuatro entradas.

| Dónde está el usuario | Cómo le habla |
|---|---|
| Home | La caja del Home |
| Dentro de un chat | Panel lateral, con atajo o botón |
| Fuera de la app | Ventana flotante con el mismo atajo global |
| Fuera de la PC | Telegram, WhatsApp o Discord por el Gateway |

### 3.1 En el Home

El Home de hoy (`src/features/home/HomeWelcome.tsx`: arte, saludo, sugerencias y la caja). Con el modo activo:

- La caja le escribe a ella, no crea un chat nuevo.
- Donde están el saludo y las sugerencias se ven sus últimos mensajes y una línea de estado («2 chats trabajando · 3 encargos»). Contesta ahí mismo.
- Un chat normal se crea con «Nuevo chat» de la barra lateral, que no cambia, o pidiéndoselo a ella.

### 3.2 Entrar del todo

Un botón «Entrar» abre la misma conversación a pantalla completa: historial entero por días y, a un lado, tres paneles: **Encargos**, **Vigilando** e **Hice sola**. «Salir» vuelve al Home.

### 3.3 Desde un chat

El atajo (o un botón en la barra superior) abre un panel lateral derecho sin salir del chat. Ella recibe como contexto qué chat está abierto, así «esto» se refiere a ese chat: «resume lo que va», «cuando esto termine, avísame por Telegram», «pásale lo que encontró este chat al del Gateway».

Además, mencionarla desde la caja del chat (`@Rinari avísame cuando esto acabe`, RC-11): el mensaje le llega a ella con ese chat como contexto, no al chat. La respuesta se ve en el panel lateral, que se abre solo, para que no haya duda de quién contesta.

### 3.4 Ventana flotante

Pequeña, siempre encima, con el atajo global `Ctrl+Shift+Espacio` (RC-15, configurable). El mismo atajo abre el panel lateral dentro de la app; si otro programa ya lo usa, Ajustes lo avisa. Con voz, mantenerlo pulsado será hablar. Es la caja del Home sin barra lateral, con la mascota mostrando su estado: escucha, piensa, trabaja, tiene algo que decir. Aquí entra después la voz. El arte de los estados sigue [docs/design/obsidiana-neon.md](../design/obsidiana-neon.md).

## 4. Funciones

Todas entran (dueño, 2026-11-11, RC-18). El orden de construcción está en la sección 10; las cinco marcadas con ★ son las primeras, las que hacen que se sienta viva desde el primer día.

Lo pesado no se hace en su conversación: lo hacen los chats y los subagentes, con su detalle completo. Ella coordina, recuerda y lo cuenta.

### 4.1 Estar al tanto

- ★ **«¿Qué pasó mientras no estaba?»** Al volver, cuenta en pocas frases lo que terminó, lo que falló y lo que espera al dueño.
- **Resumen de la mañana.** Qué hay pendiente hoy, qué corrió en la noche, qué necesita una decisión.
- **Estado al vuelo.** «¿En qué anda el Gateway?», sin abrir el chat.
- ★ **Lo que te espera.** Las aprobaciones y preguntas de todos los chats en un solo lugar, y se responden desde ella.

### 4.2 Mandar

- ★ **Delegar.** «Arregla el login del panel»: abre un chat en el proyecto correcto, lo lleva y avisa.
- ★ **Seguir un chat.** «Cuando este termine, corre las pruebas y si pasan abre el PR».
- **Cadenas entre chats.** Pasar lo que encontró uno a otro.
- **Destrabar.** Si un chat se queda parado por algo que ella puede contestar, lo contesta.
- **Agency.** Darle órdenes al jefe de cualquier equipo y traer el resultado (RC-7).

### 4.3 Recordar

- **Conoce al dueño.** Sus proyectos, cómo trabaja, sus decisiones pasadas.
- **Diario.** «¿Qué hicimos el martes?», «¿cuándo desplegamos tal versión?». Un diario por día sobre la compactación y la memoria que ya existen.
- ★ **Recordatorios y pendientes.** «Recuérdame llamar a alguien a las 5», y una lista de pendientes del dueño que ella lleva.
- **Notas al vuelo.** «Anota esta idea», y luego se encuentra.

### 4.4 Vigilar (encargos)

- CI, PRs y despliegues.
- Servidores y servicios caídos.
- Uso y límites de los proveedores.
- Mensajes de ciertas personas o canales.
- Cualquier cosa consultable por un conector.

### 4.5 Iniciativa

- **Propone.** «Llevas tres días sin tocar tal PR, ¿lo cierro o lo retomo?».
- **Detecta patrones.** «Esto lo haces cada lunes, ¿lo dejo como encargo?».
- **Cierra cabos.** Nota un «luego lo veo» y lo trae de vuelta.
- **Opina.** Dice si algo le parece mala idea antes de hacerlo.

### 4.6 Presencia en la PC

- **Sabe qué mira el dueño.** El chat abierto y, con permiso, la ventana activa o una captura cuando se le pide.
- **Portapapeles y archivos.** «Mira lo que copié»; arrastrarle un archivo a la ventana flotante.
- **Avisos del sistema.** Notificaciones del sistema operativo escritas por ella, no genéricas.
- **Mascota con estados** y sus reacciones (sección 3.4).

### 4.7 Fuera de la PC

- La misma conversación por Telegram, WhatsApp y Discord.
- Notas de voz de ida y vuelta, antes del full duplex.
- Contestar por el dueño a quien él autorice, con confirmación por defecto (RC-2).

### 4.8 Control

- Paneles Encargos, Vigilando e Hice sola.
- Pausa, horas de silencio, presupuesto.
- «Olvida esto», y revisar qué recuerda del dueño.

## 5. Autonomía

**Regla base:** todo lo que hace sola viene de un evento o de un encargo del dueño.

- **Encargos.** Órdenes permanentes («vigila el CI de tal repo», «cada mañana dame el resumen»). Lista visible; cada uno se pausa o se borra.
- **Despertares.** Eventos (terminó un chat, llegó un mensaje, falló algo) y tareas programadas. El pulso periódico existe como ajuste, apagado por defecto (RC-5).
- **Tres niveles de acción:**
  1. Libre: leer, revisar, resumir, ordenar su memoria, planear.
  2. Dentro del presupuesto: lanzar turnos en chats, usar subagentes, programar, editar en los proyectos del dueño.
  3. Con confirmación: lo irreversible hacia afuera (enviar a terceros, borrar sin vuelta, pagar), salvo que el dueño quite el ajuste (RC-2).
- **Presupuesto.** Tope por turno autónomo y por día como ajuste, sin límite por defecto (RC-6). Un modelo barato decide si algo importa; el grande solo trabaja.
- **Atención.** Cada resultado termina en una de tres salidas: interrumpe ya, se guarda para cuando el dueño vuelva, o solo se anota. Con horas de silencio.
- **Registro «Hice sola».** Qué hizo, por qué encargo o evento, cuánto costó, y deshacer cuando se pueda.
- **Freno.** Botón de pausa y «Rinari, para» por cualquier canal. Un turno autónomo no puede despertarse a sí mismo.

### 5.1 Seguridad

Una conversación continua con acceso total que lee web, mensajes y archivos ajenos es el blanco ideal de una inyección. La guardia de contenido externo es un ajuste, activo por defecto (RC-13), aparte de la confirmación del nivel 3. Al apagar cualquiera de los dos, Ajustes dice en una línea qué riesgo se acepta.

### 5.2 Eventos que la despiertan

Todos los que el Engine ya emite (RC-12). Del protocolo actual (`src/types/protocol.generated.ts`):

- **Chats:** terminó o falló un turno, un chat pide aprobación (`approval.requested`) o hace una pregunta (`question.requested`), una hija cambió (`session.child.updated`), un subagente terminó o falló.
- **Tareas programadas:** `schedule.run.completed`, `schedule.run.needs_you`.
- **Canales:** `channel.requested`, mensajes entrantes por el Gateway.
- **Repositorio:** `repo.pr.created`, `repo.pr.failed`, `repo.status.updated`.
- **Agency:** recados, cadenas detenidas (`agency.chain.stopped`), cambios de equipo.
- **Sistema:** un conector se cae (`mcp.status.changed`), el modelo falla o cambia al de respaldo (`model.failed`, `model.fallback`), límites de uso (`provider.usage.updated`), trabajos de documentos, actualización disponible.
- **Propuestas:** memoria (`memory.candidate.created`), skills (`skill.proposed`), seguimientos (`followup.suggested`).

Un modelo barato clasifica cada evento contra los encargos y la atención (sección 5); la mayoría solo se anota.

## 6. Cómo habla: el registro humano

Tres capas separadas:

- **Soul:** quién es. El de por defecto, sin cambios.
- **Intensidad** (`src/rinari/soul/intensity.py` en el Engine: Mínimo, Equilibrado, Personaje completo): cuánto personaje muestra. Sin cambios.
- **Registro humano (nuevo):** cómo conversa. Solo en esta conversación, con cualquier soul y cualquier nivel (RC-8, RC-9). Los chats normales no lo llevan.

Qué pide el registro:

- Habla como persona: corto, una idea a la vez, sin títulos, listas ni tablas salvo que se pidan. El detalle va a los paneles o se da si se pregunta.
- Sin muletillas de asistente: nada de «¡Claro!», repetir la pregunta, avisos de «como asistente» ni menús de opciones al final.
- Informa como compañera: «ya quedó, lo único raro fue el test del vault».
- Tiene continuidad: recuerda ayer, sabe la hora y cuánto lleva el dueño sin hablarle, retoma temas.
- Tiene opinión e iniciativa: dice si algo le parece mala idea; si no sabe, va a ver.
- Reacciona a lo que pasa: un CI rojo de madrugada no suena igual que un saludo.
- La honestidad no cambia: nunca inventa y dice lo que no comprobó, con palabras de persona.
- Sirve para voz: lo que no se puede decir en voz alta con naturalidad está mal escrito.

Es un bloque del prompt, igual para todo modelo y proveedor. Lleva unos pocos ejemplos de intercambio porque los modelos pequeños vuelven al tono de asistente; se prueba con un modelo local pequeño, no solo con los grandes.

## 7. Residencia y Gateway

- Con la app conectada a un Gateway, la conversación vive allí: sigue encendida con la PC apagada y los canales le llegan directo. La app es una ventana a ella.
- Sin Gateway, vive en el Engine local y solo corre con la app abierta o en la bandeja.
- Se apoya en la conexión remota que ya existe: emparejar la app con un Gateway y usar su Engine (R4 y Agent #128, fusionados).

### 7.1 Mudanza entre local y servidor

- **Primera conexión con conversación local y servidor vacío:** la app pregunta una vez si mudarla. Mudar lleva historial, diario, memoria y encargos (la memoria ya se exporta e importa). Si el dueño dice que no, sigue local y el servidor no tiene ninguna.
- **El servidor ya tiene una:** manda la del servidor. La local queda archivada como un chat normal de solo lectura y su memoria se importa.
- **Servidor inalcanzable un rato:** no se crea una segunda. La caja lo dice («Rinari está en tu servidor y no responde») y lo escrito queda en cola hasta reconectar.
- **Volver a local:** una acción explícita en Ajustes, que la trae de vuelta con todo.
- **El servidor no vuelve** (se eliminó, se perdió): mientras está conectada, la app guarda una copia local de Presencia (historial, diario, memoria y encargos) y la pone al día en cada conexión. Con el servidor inalcanzable, Ajustes ofrece «Recuperar Presencia en esta PC», que la restaura desde esa copia y dice de cuándo es. Lo que pasó en el servidor después de la última copia se pierde, y se avisa. Si el servidor reaparece más tarde, la app pregunta cuál se queda; nunca hay dos activas.

### 7.2 Usar la PC cuando vive en el servidor

Dos caminos, que conviven:

- **Por chats (siempre):** un chat de un proyecto de la PC corre en el Engine de la PC. Desde el servidor, ella le manda trabajo o abre uno nuevo allí, y lee el resultado.
- **Directo (ajuste, RC-17):** «Permitir que Presencia use esta PC». Con él activo y la app conectada, ella usa archivos, terminal y navegador de la PC como si viviera en ella: el Engine de la PC ejecuta esas herramientas a pedido del servidor. Se pregunta al mudarla y se cambia en Ajustes, por PC.

En los dos casos mandan los permisos de esa PC (confirmación de lo irreversible y guardia, según sus ajustes). Con la PC apagada o la app cerrada, ella lo dice y deja la orden en cola.

Verificado (Gateway `0.2.0` en 82ca565, Agent main en 621c8105):

- La conexión remota va en un solo sentido: la app emparejada usa el Engine del servidor con el mismo protocolo (`src/rinari_gateway/remote.py`; en la app, «Conectar a mi servidor», [Xainner/Rinari-Agent#128](https://github.com/Xainner/Rinari-Agent/pull/128), fusionado). El Gateway solo retransmite.
- No existe el sentido contrario: el servidor no puede pedirle nada al Engine de la PC. El navegador nativo está bloqueado a propósito para dispositivos remotos, y los archivos que sirve son los del servidor.
- Así que los dos caminos de arriba son trabajo nuevo: un canal de vuelta por la misma conexión, por el que el Engine de la PC recibe órdenes del servidor (un turno para un chat suyo, o una herramienta que ejecutar) y devuelve el resultado.

## 8. Voz (después)

El protocolo de GPT-Live encaja con este diseño: la capa de voz escucha y habla, y delega las tareas a un backend. Ese backend es esta conversación. Se implementa una vez contra el protocolo y sirve para GPT-Live y para cualquier modelo compatible, local o no (por ejemplo Sophon-Realtime, que pide una GPU de 80 GB). Sin código por proveedor.

## 9. Lo que el Engine ya tiene y lo que falta

Revisado en el Engine 98496c5 (0.4.3), 2026-11-11.

| Necesidad | Hoy | Falta |
|---|---|---|
| Ver todos los chats y leer cualquiera | `rinari.status`, `rinari.sessions`, `rinari.session`, `rinari.turn` | Nada |
| Abrir un chat | `session.start` y `session.offer`, solo como hijas de la conversación | Abrir un chat normal, no hija, en cualquier proyecto |
| Escribirle a un chat | `session.message`, solo a hijas propias | A cualquier chat. El protocolo ya tiene `session.turn.start`, `session.queue.add` y `session.turn.steer`; falta la herramienta |
| Detener o guiar un turno ajeno | Solo desde la app (`session.turn.cancel`, `session.turn.steer`) | La herramienta |
| Enterarse de que un chat terminó | El informe de una hija despierta a la madre | Lo mismo para cualquier chat, y la bandeja de eventos durable (sección 5.2) |
| Programar | `schedule.propose`, `schedule.list`, `schedule.update`, `schedule.cancel` | Que una corrida caiga en su conversación con sus permisos: hoy una corrida no lleva permisos y pide lo que necesita |
| Vigilar trabajos largos | `job.watch`, `wait.for` | `job.watch` se pierde al reiniciar; los encargos deben sobrevivir |
| Agency | `teams.list`, `team.members`, `team.routines`, `team.routine.create`, `office.read`, `office.say`, `errand.create`, `errand.review` | Verificado: solo existen en conversaciones de la Agency (un puesto o el chat directo de un agente, `_agency_pack` en `cli/agent_runtime.py`). Un chat normal no las tiene. Falta un tercer paquete para Presencia; el del chat directo (`direct_tools`: ver equipos, dejar un recado que toma el jefe, revisarlo) es casi lo que necesita. Por decidir: con qué nombre escribe en una oficina, porque no es un agente |
| Memoria | `memory.*` | El diario por día |
| Subagentes | `agent.*` | Nada |

Conclusión: leer ya está. Actuar sobre chats ajenos es sobre todo exponer como herramientas operaciones que el protocolo ya tiene. Lo nuevo de verdad es la bandeja de eventos durable, los encargos y que lo programado corra con sus permisos. Las herramientas nuevas van bajo demanda, no al núcleo (AGENTS.md del Engine, «Herramientas»).

## 10. Fases

1. **Conversación continua y Home.** El modo, la sesión que no termina, el diario por día, la caja del Home, «Entrar». Funciones: estado al vuelo, diario, conoce al dueño, notas.
2. **Registro humano.** El bloque del prompt y sus pruebas con varios modelos.
3. **Manos.** Herramientas sobre chats, tareas programadas y Agency (sección 9). Funciones: delegar ★, seguir un chat ★, cadenas, lo que te espera ★, recordatorios y pendientes ★.
4. **Autonomía.** Bandeja de eventos, encargos, atención, registro, freno y ajustes. Funciones: «¿qué pasó mientras no estaba?» ★, resumen de la mañana, destrabar, vigilar, iniciativa, panel de control.
5. **Panel lateral, ventana flotante y PC.** Atajo global, mención `@Rinari`, estados de la mascota, qué mira el dueño, portapapeles, avisos del sistema.
6. **Gateway.** Residencia en el servidor, mudanza, copia local, usar la PC desde el servidor, canales, notas de voz, contestar por el dueño.
7. **Voz.**

Las fases 1 y 2 ya dan algo usable; de la 3 en adelante cada una suma sin rehacer la anterior. Las cinco ★ quedan completas al cerrar la fase 4.

## 11. Pendiente de decidir

- **Agency:** con qué nombre escribe Presencia en una oficina (sección 9).

## 12. Estado de la implementación (2026-11-16)

En `feat/presencia` de Rinari-CLI y Rinari-Agent, con commits locales y sin PR.

**Hecho (fases 1 y 2, primera entrega):**

- **Engine.** `presence.get` y `presence.set` (capacidad `presence_v1`). Una conversación por instalación, chat con `lineage_kind` `presence` y acceso total, que no sale en `session.list` y no se puede cerrar, archivar ni borrar; apagar el modo la conserva. Su prompt dice qué es esa conversación y lleva el registro humano después del nivel de intensidad, en los tres niveles (`src/rinari/presence.py`, `tests/unit/test_presence.py`).
- **App.** Ajustes → Presencia con el interruptor. Con el modo encendido: la app se abre en ella, tiene su entrada «Rinari» arriba de la barra lateral, su cabecera con el estado real de los chats, y «Entrar» la pone a pantalla completa, sin barra lateral, con el panel «Te espera» y «Trabajando». «Nueva conversación» sigue creando un chat normal. Escenario `tests/ui/presence`.

**Distinto de lo bocetado, a propósito:**

- La conversación de Presencia se abre como la conversación activa (igual que un chat de la Agency), así que el Home con el modo encendido es ella entera, no una caja con sus últimos mensajes: se ve el saludo mientras está vacía y la conversación después.
- El panel del modo completo solo tiene «Te espera» y «Trabajando», que es lo que el Engine informa hoy. «Encargos» e «Hice sola» llegan con la autonomía (fase 4): no se muestran vacíos.

**Falta de las fases 1 y 2:**

- El diario por día.
- Responder desde el panel a lo que espera (hoy cada fila abre su chat).
- Probar el registro humano con modelos reales, pequeños incluidos: hoy solo está comprobado que llega al prompt.
- Que `presence_v1` entre en `engine-manifest.json` al fijar el Engine ya fusionado, y `protocol:check` contra ese commit.

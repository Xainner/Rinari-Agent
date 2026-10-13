# Permisos v4: menos preguntas, y un modo Autónomo de verdad

Estado: **propuesta para revisar** (2026-10-12). Pedido del dueño: «Hermes, Claude Code y Codex no me piden permiso en modo normal ni para MCP, SSH y demás herramientas; Rinari, ni en "permitir todo", deja de preguntar». Se rehacen los permisos para toda la app (conversaciones, Boards, tareas programadas y [Rinari Agency](idea-rinari-agency.md)).

## Qué hay hoy (permisos v3, verificado)

En `policy/engine.py` (RInari-CLI):
- **Tres perfiles:** Solo lectura, Workspace y Acceso completo.
  - **Workspace:** libre dentro del proyecto y la LAN y leyendo internet; **pregunta** (una vez o «siempre en este proyecto») para escribir o ejecutar fuera, enviar datos a internet, **llamar a MCP** y `git push`.
  - **Acceso completo:** «no pregunta nada salvo la lista dura».
- **La lista dura, siempre preguntada:** `force push`, borrar fuera del proyecto y los secretos del sistema (claves SSH, almacenes de credenciales). No admite «siempre».
- **La guardia de contenido externo:** después de leer contenido de fuera (una página, una API, **el resultado de un MCP**), la siguiente acción que envía datos fuera (un POST, **una llamada MCP**, `git push`, `curl` con cuerpo, subir algo en el navegador) **pregunta incluso en Acceso completo**.
- **Por eso pregunta tanto en la práctica:** casi toda tarea con MCP lee un resultado de MCP (contenido externo) y luego vuelve a llamar al MCP (envío): la guardia salta en Acceso completo. Pasó en la sesión del Visual Lab ([plan 0.3.2](plan-0.3.2.md) #48), y lo mismo con SSH.

## Propuesta: cuatro modos, nombrados por lo que hacen

| Modo | Qué hace | Para qué |
|---|---|---|
| **Solo lectura** | Lee todo (local e internet) menos secretos; no escribe, no ejecuta, no envía. | PLAN y REVIEW, explorar. |
| **Proyecto** (hoy «Workspace») | Libre dentro del proyecto o chat, en localhost y la LAN; pregunta antes de actuar fuera. | El modo por defecto para trabajo cotidiano. |
| **Acceso completo** | **No pregunta por MCP, SSH, comandos ni red hacia destinos de confianza** (ver abajo). Solo pregunta la lista dura y el envío a destinos **nuevos** que salieron de contenido externo. | Trabajo serio sin interrupciones. |
| **Autónomo** | **No pregunta nada.** Ni la lista dura ni la guardia de contenido externo frenan: se registran. **Se elige con una confirmación** que explica lo que implica. | Producciones y agentes de la Agency que corren solos. |

### Destinos de confianza (lo que quita la mayoría de las preguntas)
La guardia de contenido externo existe para que una inyección no saque datos a escondidas. Pero los destinos que **el dueño ya configuró** no son el riesgo:
- **los servidores MCP registrados**, **los destinos SSH guardados**, el **remoto git** del proyecto, `localhost` y la LAN.

En Acceso completo, enviar a esos destinos **no pregunta**, aunque el turno haya leído contenido externo. Solo pregunta enviar a un destino **nuevo** (un host que no está en esa lista, por ejemplo una URL que apareció en una página o en un correo): justo el caso de una exfiltración.

### Autónomo
- **No pregunta nada.** Lo que protege deja de ser la pregunta y pasa a ser:
  - el **presupuesto** (tokens, costo, tiempo), que corta solo;
  - el **registro** de todo lo que hizo, con un resumen al terminar;
  - **deshacer** donde se puede (cambios de archivos del turno, checkpoints);
  - una **lista de cosas prohibidas** que define el dueño (por ejemplo, «nunca `rm -rf` fuera del proyecto», «nunca publicar en X»).
- **La confirmación al elegirlo** dice en claro: «Rinari no te va a preguntar nada. Si lee una página o un correo con instrucciones maliciosas, puede seguirlas. Úsalo con tareas y fuentes en las que confíes.»
- **Siempre visible:** un distintivo «Autónomo» en el composer, en la cabecera de la sesión y en el agente de la Agency.

## Dónde se elige el modo

- **Por conversación** (el selector de hoy), con un **valor por defecto por proyecto**.
- **Por tarea programada** y **por agente y por equipo** en la Agency.
- Las aprobaciones «siempre en esta sesión» y «siempre en este proyecto» siguen igual para los modos que preguntan.

## Migración

- Workspace pasa a llamarse **Proyecto**, sin cambiar su comportamiento.
- **Acceso completo** gana los destinos de confianza: pregunta mucho menos que hoy.
- **Autónomo** es nuevo; nadie queda en él sin elegirlo.

## Decisiones para el dueño

| # | Decisión | Recomendado |
|---|---|---|
| P-1 | Cuatro modos: Solo lectura, Proyecto, Acceso completo y Autónomo | Sí |
| P-2 | En Acceso completo, los destinos de confianza (MCP registrados, SSH guardados, remoto git, localhost/LAN) no preguntan aunque se haya leído contenido externo | Sí |
| P-3 | En Autónomo no se pregunta nada, ni siquiera la lista dura (`force push`, borrar fuera, secretos); queda registrado | A decidir. Recomendado: sí, salvo **leer secretos del sistema**, que por defecto queda **bloqueado** (no preguntado) y el dueño lo puede desbloquear |
| P-4 | Autónomo se elige con una confirmación que explica el riesgo, y queda siempre visible | Sí |
| P-5 | El modo se elige por conversación, con valor por defecto por proyecto, por tarea programada y por agente/equipo en la Agency | Sí |

## Pruebas (cuando se implemente)
- CLI: tabla de casos por modo (lectura, escritura dentro y fuera, comando, MCP, SSH, red a destino de confianza y a destino nuevo, después de leer contenido externo, lista dura, secretos).
- App: la confirmación de Autónomo, el distintivo visible y el selector con los cuatro modos.

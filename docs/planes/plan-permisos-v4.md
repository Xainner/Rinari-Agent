# Permisos v4: tres modos, y Acceso completo sin preguntas

Estado: **decidido** (dueño, 2026-10-12). Pedido del dueño: «Hermes, Claude Code y Codex no me piden permiso en modo normal ni para MCP, SSH y demás herramientas; Rinari, ni en "permitir todo", deja de preguntar». Se rehacen los permisos para toda la app (conversaciones, Boards, tareas programadas y [Rinari Agency](idea-rinari-agency.md)).

## Qué hay hoy (permisos v3, verificado)

En `policy/engine.py` (RInari-CLI):
- **Tres perfiles:** Solo lectura, Workspace y Acceso completo.
  - **Workspace:** libre dentro del proyecto y la LAN y leyendo internet; **pregunta** (una vez o «siempre en este proyecto») para escribir o ejecutar fuera, enviar datos a internet, **llamar a MCP** y `git push`.
  - **Acceso completo:** «no pregunta nada salvo la lista dura».
- **La lista dura, siempre preguntada:** `force push`, borrar fuera del proyecto y los secretos del sistema (claves SSH, almacenes de credenciales). No admite «siempre».
- **La guardia de contenido externo:** después de leer contenido de fuera (una página, una API, **el resultado de un MCP**), la siguiente acción que envía datos fuera (un POST, **una llamada MCP**, `git push`, `curl` con cuerpo, subir algo en el navegador) **pregunta incluso en Acceso completo**.
- **Por eso pregunta tanto en la práctica:** casi toda tarea con MCP lee un resultado de MCP (contenido externo) y luego vuelve a llamar al MCP (envío): la guardia salta en Acceso completo. Pasó en la sesión del Visual Lab ([plan 0.4.0](plan-0.4.0.md) #48), y lo mismo con SSH.

## Lo decidido: tres modos

| Modo | Qué hace | Para qué |
|---|---|---|
| **Solo lectura** | Lee todo (local e internet); no escribe, no ejecuta, no envía. | PLAN y REVIEW, explorar. |
| **Proyecto** (hoy «Workspace») | Libre dentro del proyecto o chat, en localhost y la LAN; pregunta antes de actuar fuera (escribir o ejecutar fuera, enviar datos a internet, `git push`). | El modo por defecto para el trabajo cotidiano. |
| **Acceso completo** | **No pregunta nada:** MCP, SSH, comandos, red, `force push`, borrar fuera del proyecto, **secretos del sistema**. Solo queda la **lista catastrófica fija**. | Trabajo sin interrupciones, tareas programadas y agentes de la Agency que corren solos. |

Es lo que hacen el modo de todo permitido de Claude Code, el acceso completo de Codex y el YOLO de Hermes. Se descartó un cuarto modo «Autónomo» separado: era casi igual a Acceso completo y confundía (dueño, 2026-10-12).

### La lista catastrófica fija
Ni Acceso completo la levanta, y no tiene opción para anularla: borrar la raíz del sistema o un disco entero, formatear, escribir directo a un disco físico y las bombas de procesos. Se rechazan sin preguntar, con el motivo.

### Lo que protege en Acceso completo
Ya no son las preguntas, sino:
- el **presupuesto** (tokens, costo, tiempo), que corta solo;
- el **registro** de todo lo que hizo, con un resumen al terminar;
- **deshacer** donde se puede (cambios de archivos del turno, checkpoints);
- una **lista de cosas prohibidas** opcional que define el dueño (por ejemplo, «nunca publicar en X»).

### El interruptor de destinos nuevos
En Ajustes → Permisos: **«Preguntar antes de enviar datos a destinos nuevos»**, **apagado por defecto**. Encendido, Acceso completo pregunta solo una cosa: enviar datos a un destino que **no** es de confianza después de haber leído contenido externo (por ejemplo, una URL que apareció en una página o en un correo). Los destinos de confianza no preguntan nunca: los servidores MCP registrados, los destinos SSH guardados, el remoto git del proyecto, `localhost` y la LAN. Es la protección contra el robo de datos por inyección, para quien la quiera.

### La confirmación al activarlo (ya existe; se actualiza)
El diálogo «¿Activar Acceso completo?» ya existe (`perm.full.*` en `src/i18n/es.ts` / `en.ts`). Se actualiza:
- `perm.full.stillAsks` deja de decir que pregunta antes de borrar fuera, forzar un push, tocar secretos o enviar datos tras leer internet. Pasa a decir: «Rinari no te va a preguntar nada. Solo rechaza lo catastrófico (borrar el sistema o un disco entero, formatear).»
- `perm.full.risk` dice en claro: «Si lee una página o un correo con instrucciones maliciosas, puede seguirlas. Úsalo con tareas y fuentes en las que confíes. Puedes activar "Preguntar antes de enviar datos a destinos nuevos" en Ajustes.»
- `perm.fullAccessHint` (el texto corto del selector): «No pregunta nada. Solo rechaza lo catastrófico.»
- **Siempre visible:** el chip de permisos junto al mensaje ya lo muestra; se suma el distintivo en la cabecera de la sesión y en los agentes de la Agency.

## Referencia: cómo lo hace Hermes Agent (consultado 2026-10-12)

- Tres modos de aprobación (`approvals.mode`: `manual`, `smart` —un modelo auxiliar decide— y `off`); `off` equivale a `--yolo` / `/yolo`, que se salta **todas** las aprobaciones de comandos peligrosos de la sesión.
- **Lo único que YOLO no levanta** es una lista dura de comandos catastróficos (`rm -rf /`, bombas de procesos, `mkfs` sobre la raíz, `dd` a discos físicos), sin opción de anularla.
- **Los secretos no se bloquean al leer:** las protecciones de `~/.ssh/`, `~/.aws/` y su `.env` son solo de escritura, y su propia documentación avisa que la terminal puede leerlos igual. Solo los `.env` de proyecto se niegan a las herramientas de archivos.
- Mientras YOLO está activo, muestra un aviso rojo permanente.
- Fuentes: [seguridad de Hermes Agent](https://hermes-agent.nousresearch.com/docs/user-guide/security/), [guía para una máquina de trabajo](https://hermes-agent.nousresearch.com/docs/guides/secure-hermes-on-a-work-machine).

## Dónde se elige el modo

- **Por conversación** (el selector de hoy), con un **valor por defecto por proyecto**.
- **Por tarea programada**, y **por agente y por equipo** en la Agency.
- Las aprobaciones «siempre en esta sesión» y «siempre en este proyecto» siguen igual en Proyecto.

## Migración

- Workspace pasa a llamarse **Proyecto**, sin cambiar su comportamiento.
- Quien hoy tiene **Acceso completo** pasa al nuevo, que pregunta menos; la primera vez se le muestra la confirmación actualizada.

## Decisiones

| # | Decisión | Estado |
|---|---|---|
| P-1 | Tres modos: Solo lectura, Proyecto y Acceso completo | Decidido (2026-10-12) |
| P-2 | Acceso completo no pregunta nada, tampoco la lista dura ni los secretos; queda solo la lista catastrófica fija, como Hermes | Decidido (2026-10-12) |
| P-3 | Interruptor «Preguntar antes de enviar datos a destinos nuevos», apagado por defecto | Decidido (2026-10-12) |
| P-4 | Se actualiza la confirmación que ya existe y el modo queda siempre visible | Decidido (2026-10-12) |
| P-5 | El modo se elige por conversación, con valor por defecto por proyecto, por tarea programada y por agente/equipo en la Agency | Decidido (2026-10-12) |

## Pruebas (cuando se implemente)
- CLI: tabla de casos por modo (lectura, escritura dentro y fuera, comando, MCP, SSH, red, secretos, `force push`, después de leer contenido externo); la lista catastrófica rechaza en Acceso completo; con el interruptor encendido, solo pregunta el envío a un destino nuevo tras contenido externo, y nunca a un destino de confianza.
- App: la confirmación actualizada, el interruptor en Ajustes, el selector con los tres modos y el distintivo visible.

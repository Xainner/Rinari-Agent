# Rinari Gateway: reescritura desde cero

Estado: **listo para R0** (dueño, 2026-10-22). Sustituye al plan anterior (G0–G4, borrador del 2026-10-12, fuera de la 0.4.0 desde el 2026-10-15), que sigue en el historial de git de este archivo. Repo: `Xainner/Rinari-Gateway` (clon local en `Documents/DEV/Apps/Rinari-Gateway`).

## Decisiones del dueño (2026-10-22)

1. **El Gateway se rehace desde cero, en el mismo repo.** Una rama nueva parte vacía; el código viejo queda en `main` y en el historial como referencia. Se rehacen la funcionalidad y la interfaz.
2. **Lo bueno se conserva como idea y como referencia, no como código copiado:** el MCP del vault de Obsidian y los bots de WhatsApp, Telegram y Discord.
3. **Se empieza limpio.** No se migran conversaciones, memoria, automatizaciones ni vínculos de saturno. El Gateway viejo sigue corriendo hasta el cambio y sus datos quedan como respaldo.
4. **Toda la lógica es del Engine.** Rutinas, planificador, trabajos, memoria, skills y la Agency viven en el Engine (Rinari-CLI). El Gateway nuevo no tiene planificador, memoria ni trabajos propios, y no mete adaptadores dentro del proceso del Engine.
5. **No es un «Rinari en la nube».** La web es un **panel de configuración**: no muestra sesiones ni chats de Rinari.
6. **La excepción es la Agency:** corre 24/7 en el servidor y **sí se ve en la web** (sus chats, su pizarra y su registro).
7. **La app de escritorio (y mañana la móvil) puede conectarse al Engine del servidor**, y ahí sí ve sus chats. La web no.
8. Se mantienen las respuestas del 2026-10-15: la app trabaja con **un Engine a la vez**, con un cambio rápido entre ellos, y **el pin del Engine del Gateway sube junto con el del Agent**.
9. **UI compartida por pin del Agent.** El build del panel toma `Rinari-Agent` en un commit fijado, igual que el pin del Engine, e importa de ahí los tokens de Obsidiana neón y los componentes de la Agency. Ese pin sube junto con el del Engine.
10. **El panel es solo de red privada** (LAN o Tailscale) y además pide una contraseña simple del dueño. Nunca se publica.
11. **Versión:** el Gateway nuevo arranca en `0.2.0`, con pre-releases `0.2.0aN`.
12. **Dominio:** `rinari.xainner.com` se reutiliza en el cambio (R6) y solo expone **los webhooks** (cada uno con su secreto) y **el punto de conexión remota** de la app de escritorio y la móvil (TLS, emparejamiento y token revocable). El panel nunca responde ahí.
13. **`LUSAMINE_MCP_TOKEN` no se rota.** En el Gateway nuevo pasa al almacén del Engine y sale del drop-in de systemd (`mcp-env.conf`), donde hoy está en texto plano.

## Por qué no se sube el pin del Gateway viejo (revisado 2026-10-22)

El Gateway viejo fija el Engine `ad78f3a`. La punta de `origin/0.4.0` de la CLI (`bf66b9c`) va 297 commits por delante. Las 18 capacidades que el viejo exige siguen ahí (solo se retiró `session_peer_messaging_v1`, que no usa), pero su adaptador `engine_bootstrap.py` parchea `agent_runtime._build_tools` y comprueba hashes de fuentes del Engine. Tres de esos cinco archivos cambiaron, y además el Engine ahora registra `schedule.list`, `schedule.update` y `schedule.cancel` sobre su propio planificador. Para adaptarlo habría que reescribir una pieza que la reescritura elimina, así que no se hace. La rama `feat/g0-engine-pin` del repo del Gateway se creó y quedó sin cambios.

## Qué es el Gateway nuevo

Un servicio de un solo dueño que hace cinco cosas, y nada más:

1. **Hospeda el Engine fijado.** Lo instala desde un bundle construido en el commit que fija el Agent, lo supervisa (arranque, reinicio, apagado ordenado) y le habla por stdio con el protocolo v1. Las credenciales van en el almacén del Engine, que guarda referencias y no valores. En Linux hay que confirmar con qué respaldo se resuelven, porque el Administrador de credenciales de Windows no existe allí.
2. **Bots** (Telegram, Discord, WhatsApp): cada uno es un cliente del Engine con `channel_tools_v1`. Recibe mensajes, los pasa a una sesión del Engine y entrega la respuesta con el formato de su canal. Las preguntas y aprobaciones del Engine se responden desde el propio canal.
3. **Vault de Obsidian como MCP** registrado en el Engine, con las garantías de hoy: IDs estables, revisión, SHA-256, escritura atómica y tombstones. Se rechazan rutas absolutas, `..`, symlinks y `.obsidian`. El texto de una nota nunca da permisos. Incluye el plugin de Obsidian para sincronizar.
4. **Conexión remota segura** para la app de escritorio y la móvil, por el dominio público: TLS, emparejamiento con código o QR, y token revocable. Habla con el Engine del servidor con el mismo protocolo que el Engine local. En la app aparece como «Conectar a mi servidor».
5. **Panel web de configuración** (sección siguiente).

**La Agency 24/7** corre en ese Engine. Los canales del Gateway (Telegram, correo, webhooks) son sus disparadores y sus salidas:

- Un webhook necesita la dirección pública del servidor. Un bot de Telegram admite un solo programa escuchando: es el del Gateway, nunca la PC a la vez.
- Los agentes con disparador externo nacen con «Preguntar antes de enviar datos a destinos nuevos» encendido (D-6 de la Agency), y esa pregunta se responde también desde Telegram.
- «Detener a todos» funciona desde Telegram, además de desde la app y la web.
- Conectores ([plan-conectores.md](plan-conectores.md)): primero se depuran en el escritorio. En el servidor se resuelven así:
  - el mismo catálogo;
  - OAuth sin navegador en el servidor: se autoriza desde la app conectada o desde la web;
  - renovación de tokens 24/7, con el aviso «Hay que reconectar» también por Telegram;
  - qué MCP locales (stdio) sirven en el servidor.

## Panel web

Su tema es configurar y vigilar, no conversar:

- **Bots y canales:** conectar Telegram, Discord y WhatsApp (QR), quién puede hablarle a cada bot y sus comandos.
- **Modelos y proveedores:** qué proveedor y qué modelo usan los bots. Las claves van al almacén del Engine.
- **Vault de Obsidian:** estado del vault y de su MCP, y la sincronización. No edita notas.
- **Estado y registros:** salud del Engine y de los bots, versión y pin, actualizaciones, respaldos y registro de errores.
- **La Agency (excepción):** su vista Normal (chats, pizarra, registro), sus agentes, sus disparadores, sus credenciales y «Detener a todos». La vista de 8 bits llega cuando la Agency la tenga.
- **Emparejar dispositivos:** crear y revocar los tokens de la conexión remota.

El panel solo escucha en la red privada (LAN o Tailscale) y además pide la contraseña del dueño. Todo endpoint protegido responde 401 sin sesión.

Diseño: sistema Obsidiana neón ([docs/design/obsidiana-neon.md](../design/obsidiana-neon.md)). Los tokens y los componentes de la Agency vienen del Agent por su pin (decisión 9), no se copian. La vista de la Agency habla con el Engine del servidor por un puente web que implementa los comandos `agency_*` de `platform()`.

## Qué desaparece respecto al viejo

Son unas 22 000 líneas de Python y 21 000 de TypeScript. Desaparecen:

- el planificador, las automatizaciones, los trabajos durables, la memoria y las skills propias (`scheduler.py`, `automations*.py`, `jobs.py`, `memory.py`, `skills.py`…);
- el adaptador en proceso del Engine (`engine_bootstrap.py` y `engine_adapter_hashes.json`);
- la conversación web con Rinari (`web_chat.py` y el chat del panel);
- los modelos por conversación, la presentación del dueño y el resto de lógica que ya da el Engine.

Lo que el viejo resolvió bien se lee antes de rehacerlo: formato por canal, archivos y medios, steering desde el canal, privacidad al borrar, recuperación de turnos y despliegue con releases inmutables. Las notas de despliegue en saturno (proxy en casa3090, regla UFW de NPM, releases y symlink `current`) están en el `CLAUDE.md` del repo del Gateway.

## Orden

| Paso | Qué |
|---|---|
| R0 | Rama nueva vacía en el repo del Gateway. Esqueleto: servicio, configuración, Engine fijado al mismo commit que el Agent y supervisado, salud, CI y reglas del repo (`CLAUDE.md` nuevo) |
| R1 | Panel web mínimo: sesión del dueño, estado y registros, modelos y proveedores |
| R2 | Bots: Telegram primero, después Discord y WhatsApp, cada uno con su sección del panel |
| R3 | Vault de Obsidian como MCP y su plugin, con su sección del panel |
| R4 | Conexión remota segura y emparejamiento. En el Agent: «Conectar a mi servidor» y el cambio rápido entre Engines |
| R5 | La Agency 24/7: disparadores de correo, Telegram y webhooks, «Detener a todos» desde Telegram, conectores en el servidor y su vista en la web. Necesita la Agency y los conectores ya depurados en el escritorio |
| R6 | Instalación en saturno junto al viejo, cambio, respaldo de los datos viejos y apagado del servicio anterior |

## Preguntas abiertas

Ninguna: las cinco del borrador se respondieron el 2026-10-22 (decisiones 9–13).

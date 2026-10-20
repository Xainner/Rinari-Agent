# Plan de conectores

Estado: **depurado con el dueño; C0 hecho** (2026-10-19), salvo lo que necesita las cuentas del dueño, que queda para C1. Va en la **0.4.0**, por tandas en las ramas `0.4.0`, con la Nightly al terminar. No se empieza hasta que el dueño lo diga.

Sale de la tarjeta de Planka «Herramientas para docker, además validar herramientas que se le puede dar de servicios populares o de uso profesional» (Agent → Para luego) y de la fila «Después» del [plan 0.4.0](plan-0.4.0.md), que el dueño mete ahora en la 0.4.0.

Una sola sesión de Claude lleva el tema: escribe este plan, reparte los bloques en sesiones y revisa lo que entregan. Cada bloque espera el «autorizo» del dueño.

## Qué es un conector

Un servicio que el usuario conecta una vez (su cuenta y sus permisos) y que Rinari después usa con herramientas: GitHub, Gmail, Calendar, Drive, Notion, Slack, Linear, Jira, Planka, Docker…

- **Por dentro, un conector es un servidor MCP:** remoto (una URL, con OAuth o con token) o local (un comando que corre en la PC). Es lo mismo que hace Claude: sus «Conectores» son MCP remotos y sus «extensiones» de Claude Desktop son MCP locales. Claude Code y Codex los llaman «MCP servers» porque son herramientas para programadores.
- **Para el usuario**, un conector es una tarjeta con logo, la cuenta conectada y un botón «Conectar». No tiene que saber qué es MCP.
- **Decisión (dueño, 2026-10-18):** una sola pantalla, **«Conectores»**, que reemplaza a «Servidores MCP». Cada tarjeta lleva un chip pequeño «MCP remoto» o «MCP local», y «Agregar servidor MCP» (el alta manual de hoy) sigue dentro.
- **Nada hardcodeado al dueño:** el catálogo sirve a cualquier usuario; los MCP propios del dueño (Visual Lab, Planka, PufferPanel) entran como cualquier otro.

## Qué hay hoy (verificado en las ramas `0.4.0`, CLI 25296c8 y Agent 581b999, 2026-10-19)

Rehecho en C0 sobre lo que dejó F42 del [plan 0.4.0 v3](plan-0.4.0-v3.md) (la lista de herramientas fija por conversación y la puerta `tool.call`). La versión anterior se verificó en CLI 8b0733a y Agent 5f854e7.

**Engine (`src/rinari/mcp/`):**
- Transportes stdio y Streamable HTTP (`http_transport.py`), con `Mcp-Session-Id` y `MCP-Protocol-Version`. Versión por defecto del protocolo: `2024-11-05` (`protocol.py:25`).
- Autenticación HTTP: `none`, `bearer` y `headers` (`config.py:46`). Los secretos van al almacén de credenciales con referencias `mcp/<id>/<slot>` (o `env://`); nunca a la base, a las vistas ni a los registros.
- **OAuth no existe.** Un 401 con `resource_metadata` en `WWW-Authenticate` solo da la pista `oauth_required` (`http_transport.py:307`), y la app dice que use un token como Bearer.
- Ámbitos `global` y `project`; uno de proyecto exige confianza en la carpeta (`service.py:250`).
- **Los servidores se conectan al armar el runtime** (`_build_tools` en `cli/agent_runtime.py:1303` → `_mcp_tools`, línea 1275), **uno tras otro y esperando a cada uno**: un local arranca su proceso y un remoto hace `initialize`; después, `tools/list` a cada uno. **El escritorio arma un runtime por turno** (F42, fase 1), así que esto pasa en cada turno, no solo al abrir la sesión. Las conexiones quedan en caché en el proceso del Engine (`service.py:100`) y un servidor ya conectado no vuelve a hacer `initialize`, pero sí `tools/list` en cada turno (`service.py:376`). **Un servidor caído no deja cliente en caché**, así que `_client` (`service.py:317`) lo vuelve a intentar en cada turno y espera su timeout cada vez (30 s por defecto, `config.py:57`). La sesión no se rompe.
- **Las herramientas MCP nunca entran en la lista del modelo (F42).** Salen como `mcp.<servidor>.<herramienta>` con `always_loaded=False` (`adapter.py:60`); la lista es el núcleo nativo (53) más la puerta `tool.call`, fija por conversación y guardada con la sesión (`tools/exposure.py`; se rehace solo al cambiar de modelo, al compactar o con otra versión del Engine). El modelo encuentra una herramienta MCP con `capability.search` (o `capability.activate`, que ahora es un alias de buscar), recibe su esquema y la llamada exacta, y la ejecuta con `tool.call`. Permisos, aprobaciones, timeline y registro usan el nombre real, no `tool.call`.
- **El modelo ya ve qué hay conectado.** `deferred_index(connected=True)` (`tools/index.py:36`) arma cada turno una línea por servidor MCP, spec OpenAPI o plugin con los nombres de sus herramientas y su `instructions` (marcada como «del servidor, no del dueño»). Va en la nota del turno (`CachePolicy.TURN`, `prompts/assembler.py:282`), fuera del prefijo, así que un servidor nuevo no rompe la caché.
- Capacidad `mcp.read` si el servidor declara `readOnlyHint`, si no `mcp.call` (`adapter.py:43`). `destructiveHint` y `openWorldHint` no se usan.
- `notifications/tools/list_changed` no se escucha.
- `resources` y `prompts` solo se cuentan en «Probar» (`service.py:512`) y la CLI tiene `rinari mcp resources` (`cli/commands/mcp.py:298`); el modelo no puede leerlos.
- Los archivos `.mcp.json`, `.rinari/mcp.json`, `.vscode/mcp.json` y `.cursor/mcp.json` de una carpeta se detectan solo para avisar al confiar (`engine_protocol/server.py:159`); no se importan.
- OpenAPI (`src/rinari/openapi/`): specs registradas que generan herramientas, con secretos solo como `env://`. Solo por la CLI (`rinari api`); la app no lo muestra.
- La Suscripción de Claude ya le pasa las herramientas de Rinari a Claude Code por un MCP propio (`providers/claude_cli.py:1321`).

**App:**
- Ajustes → Herramientas → MCP, «Servidores MCP» (`src/features/ecosystem/McpView.tsx`): lista con estado, Local/Remoto, Probar, Editar, Activar/Desactivar y Eliminar; alta stdio o HTTP con bearer, encabezados o nada; «Probar antes de guardar».
- No se ven ni se eligen el ámbito ni la confianza. No hay lista de herramientas (solo 8 nombres en el resultado de «Probar»), ni controles por herramienta.
- Sin catálogo, sin OAuth y sin manejador de enlaces `rinari://` (no hace falta: ver C1).
- El «Resumen» ya tiene una tarjeta **Conectores** (MCP activos y skills; `SummaryPanel.tsx:256`) y las «Fuentes» agrupan lo leído por MCP.
- Imágenes → «MCP asignado» (`ImageCreationSettings.tsx`): el usuario escribe a mano el nombre de la herramienta; no hay selector.
- Plugins es otra pantalla aparte, sin relación con MCP.

**Del dueño (solo para probar, nada depende de esto):** dos servidores HTTP globales, Rinari Visual Lab (bearer) y Motion (sin autenticación). Tiene MCP propios en `DEV/mcp-servers` (Planka, PufferPanel) y el proyecto de alojarlos en `mcp.xainner.com` (`MCP-Remote.md`).

## Lo que falta

1. **OAuth.** Los MCP remotos oficiales de los servicios grandes piden OAuth. Sin él, el usuario tiene que crear tokens a mano, y hay servicios donde no se puede.
2. **Conectar uno tras otro y esperando** alarga el arranque de cada turno, y un servidor caído lo alarga hasta su timeout **en cada turno**.
3. **No hay catálogo:** dar de alta un servicio exige saber su URL o su comando.
4. **No hay control por herramienta:** no se puede apagar una herramienta peligrosa ni decir «esta siempre se permite».
5. **El modelo ve los nombres de lo conectado (F42), pero no para qué sirve cada conector ni si hay que reconectarlo**, y no puede leer `resources`.
6. **Permisos:** casi toda tarea con MCP lee un resultado (contenido externo) y vuelve a llamar al mismo MCP, y la guardia de contenido externo lo trata como enviar datos fuera ([plan de permisos v4](plan-permisos-v4.md), punto «Por eso pregunta tanto»).
7. **Docker** se usa hoy por la consola, sin reglas propias: `docker rm`, `compose down -v` o `system prune` no se clasifican como destructivos.
8. **La Agency** necesita conectores que funcionen sin la app abierta y con permisos por agente, y eso no existe.

## Bloques

| # | Qué | Dónde | Depende de |
|---|---|---|---|
| C0 | Investigación: el catálogo servicio por servicio, OAuth con Rinari como cliente, Google con cliente propio y medir el «Preparando» | Este documento | — |
| C1 | OAuth para MCP remotos | CLI | C0 |
| C2 | Conectar como Claude Code: al abrir la sesión, en paralelo y sin bloquear | CLI | — |
| C3 | Pantalla «Conectores» | Agent (+ CLI) | C1, C2 |
| C4 | Catálogo e importar configuraciones | CLI + Agent | C0, C3 |
| C5 | Permisos por conector y por herramienta | CLI + Agent | C2 |
| C6 | El modelo sabe qué conectores tiene | CLI | C2 |
| C7 | Docker: reglas en la política y entrada en el catálogo | CLI (+ catálogo) | C4 para la entrada |
| C8 | Lo que necesita la Agency | CLI + Agent | C1, C5 |

Orden propuesto: C0; después C1 y C2 a la vez (no tocan los mismos archivos: `http_transport.py` y un `oauth.py` nuevo contra `service.py` y `agent_runtime.py`); C5 y C6; C3 con C4; C7; C8. La Agency se prueba cuando esté completa (dueño, 2026-10-18), así que C8 no adelanta a nadie: va al final y tiene que estar listo antes de esa prueba.

Lo del Gateway (el mismo catálogo y OAuth en el servidor Linux) está en [plan-gateway.md](plan-gateway.md): primero se depura aquí.

### C0. Investigación

Sin código. Sale una tabla en este documento, verificada en la fecha y probando con Rinari como cliente, no solo leyendo la documentación.

**El catálogo inicial.** Tienen MCP remoto oficial en el directorio de conectores que usa Claude (consultado el 2026-10-18):

| Grupo | Servicios |
|---|---|
| Google | Gmail, Drive y Calendar (`gmailmcp`, `drivemcp` y `calendarmcp` en `googleapis.com`) |
| Trabajo y tareas | Slack, Notion, Linear, Atlassian (Jira, Confluence), Asana, ClickUp, Todoist, Airtable |
| Desarrollo | Sentry, Vercel, Supabase, Stripe |
| Diseño y archivos | Figma, Canva, Dropbox |
| Otros | HubSpot, ElevenLabs |

Fuera del directorio: GitHub (MCP remoto oficial, con token), Planka y Docker (C7), Postgres y SQLite (MCP locales, con la cadena de conexión como secreto) y los de cada usuario.

**Qué se comprueba en cada uno:**
- Si acepta a Rinari como cliente OAuth. Algunas direcciones del directorio están hechas para Claude (`mcp.hubspot.com/anthropic`, `mcp.dropbox.com/claude_app_mcp`, `api.elevenlabs.io/v1/mcp-claude-marketplace`) y probablemente solo aceptan la app OAuth de Anthropic. ElevenLabs tiene también una general, `api.elevenlabs.io/v1/mcp`. Lo que no funcione con Rinari entra con token o se queda fuera del catálogo, anotado.
- Qué pide: registro dinámico de clientes (RFC 7591), documento de metadatos del cliente publicado en una URL, o un `client_id` propio.
- Qué versión de la especificación de autorización de MCP manda hoy (metadatos del recurso protegido, RFC 9728; PKCE; indicador de recurso).

**Google con cliente propio** (decisión del dueño, 2026-10-18): cada usuario crea su propia app OAuth en Google Cloud (un «cliente de escritorio») y pega en Rinari su `client_id` y su `client_secret`. Así ninguna app central necesita la verificación de Google para los permisos de Gmail. En C0 se confirma:
- si los MCP oficiales de Google aceptan un cliente propio así; si no, qué MCP de Google se usa;
- que en modo «Prueba» Google vence la sesión a los 7 días, y que publicada sin verificar funciona con el aviso «app no verificada» (que no importa: es la app del propio usuario);
- los pasos exactos para la guía de Rinari: crear el proyecto, activar las API de Gmail, Drive y Calendar, la pantalla de consentimiento y el cliente.

**Medir el «Preparando»:** con 0, 2 y 5 servidores activos y con uno caído, antes y después de C2. Con `RINARI_HOME` temporal, nunca con la base del dueño.

**Docker:** si hay un MCP de Docker bueno y mantenido para el catálogo (C7).

#### C0. Resultados (2026-10-19)

**Cómo se probó.** Un sondeo sin credenciales desde esta PC (scratchpad de la sesión, no está en el repo): `initialize` anónimo a cada URL, `WWW-Authenticate`, metadatos del recurso protegido (RFC 9728) y del servidor de autorización (RFC 8414 / OIDC). Solo lecturas. **No se registró ningún cliente ni se inició sesión en ningún servicio**: el registro dinámico crea un cliente en el servidor del servicio, y eso queda para C1 con el visto bueno del dueño.

**Autorización por servicio.**

| Servicio | URL | Registro dinámico | Metadatos de cliente (CIMD) | Revocación | Qué necesita Rinari |
|---|---|---|---|---|---|
| Notion | `mcp.notion.com/mcp` | sí | sí | sí | registro dinámico |
| Linear | `mcp.linear.app/mcp` | sí | sí | sí | registro dinámico |
| Todoist | `ai.todoist.net/mcp` | sí | sí | sí | registro dinámico |
| Airtable | `mcp.airtable.com/mcp` | sí | sí | no | registro dinámico |
| Sentry | `mcp.sentry.dev/mcp` | sí | sí | sí | registro dinámico |
| Canva | `mcp.canva.com/mcp` | sí | sí | sí | registro dinámico |
| ClickUp | `mcp.clickup.com/mcp` | sí | — | no | registro dinámico (cliente público) |
| Vercel | `mcp.vercel.com` | sí | — | sí | registro dinámico |
| Supabase | `mcp.supabase.com/mcp` | sí | — | no | registro dinámico |
| Stripe | `mcp.stripe.com` | sí | — | sí | registro dinámico (cliente público) |
| Figma | `mcp.figma.com/mcp` | sí | — | no | registro dinámico |
| Dropbox | `mcp.dropbox.com/mcp` | sí | — | sí | registro dinámico. La general basta: la de Claude (`/claude_app_mcp`) usa el mismo servidor de autorización |
| Atlassian | `mcp.atlassian.com/v1/mcp` | sí | — | sí | registro dinámico. **No publica metadatos del recurso** (404) y su 401 no trae `resource_metadata`: hay que caer a los metadatos del servidor en el origen (como en la especificación 2025-03-26) |
| ElevenLabs | `api.elevenlabs.io/v1/mcp` | no | **sí** | sí | **documento de metadatos del cliente** de Rinari publicado en una URL (`rinari.ai`), o `client_id` propio. Se queda en el catálogo (dueño, 2026-10-19). La de Claude (`/v1/mcp-claude-marketplace`) responde igual |
| Slack | `mcp.slack.com/mcp` | no | no | no | `client_id` y `client_secret` propios (app de Slack del usuario) |
| Asana | `mcp.asana.com/v2/mcp` | no | no | sí | `client_id` propio |
| HubSpot | `mcp.hubspot.com` | no | no | no | `client_id` y `client_secret` propios. La de Anthropic (`/anthropic`) responde igual |
| GitHub | `api.githubcopilot.com/mcp/` | no | no | no | token personal como Bearer (lo que ya funciona hoy) o una app OAuth propia |
| Google | `gmailmcp`, `drivemcp`, `calendarmcp` … `.googleapis.com/mcp/v1` | no | no | sí | cliente propio (decidido). Ver abajo |

- **Todos piden PKCE S256** y todos los que tienen metadatos del recurso los publican. Solo Atlassian no.
- **Que un servicio anuncie registro dinámico no prueba que acepte a Rinari:** puede rechazar una redirección a `127.0.0.1` o tener lista de clientes permitidos. Queda sin comprobar hasta C1.
- **C1 no puede arrancar solo con un 401.** Los MCP de Google responden `initialize` y `tools/list` sin autenticación (200, con la lista de herramientas). El 401 llegaría recién en `tools/call`. «Conectar» tiene que buscar los metadatos del recurso por su cuenta (`/.well-known/oauth-protected-resource<ruta>`) aunque no haya 401.
- **Anotaciones:** Google declara `readOnlyHint`, `destructiveHint`, `idempotentHint` y `openWorldHint` en cada herramienta, así que C5 tiene con qué trabajar.
- **Versión del protocolo:** Google contesta con `2025-06-18`. Rinari pide `2024-11-05` por defecto (`protocol.py:25`). La autorización de MCP manda desde 2025-06-18, así que C1 debería pedir esa versión o una más nueva.

**Google con cliente propio.**
- **Están en Developer Preview:** hay que inscribirse en el programa de vista previa de Google Workspace y ser aceptado ([guía de Gmail](https://developers.google.com/workspace/gmail/api/guides/configure-mcp-server), [codelab](https://codelabs.developers.google.com/google-workspace-mcp-antigravity)). Es un paso más para el usuario y la guía de Rinari lo tiene que decir primero.
- **Más servidores de los que decía el plan:** `workspacemcp` (todo en uno), `gmailmcp`, `drivemcp`, `docsmcp`, `sheetsmcp`, `slidesmcp`, `calendarmcp`, `chatmcp` y `people.googleapis.com/mcp/v1`.
- **Hay que activar** la API normal (por ejemplo `gmail.googleapis.com`) y la API MCP (`gmailmcp.googleapis.com`) de cada servicio.
- **Tipo de cliente:** las guías de Google usan «Aplicación web» con redirecciones exactas (las de Claude y Antigravity), con la casilla «Use this client for an AI-powered agent». **No se ha comprobado si un «cliente de escritorio» funciona.** Es lo que necesita el patrón `127.0.0.1:<puerto libre>`, porque un cliente web exige el puerto exacto. Se prueba en C1 con la cuenta del dueño. Si no funciona, Rinari usa un puerto fijo y la guía dice qué redirección registrar.
- **Renovación:** sin `access_type=offline` (y `prompt=consent` para una concesión que ya existe) no hay token de renovación y el usuario tendría que entrar cada hora. `offline_access` no basta.
- **En modo «Prueba»**, el token de renovación vence a los 7 días y hay un tope de 100 usuarios de prueba. Publicada, no vence salvo que se revoque o pasen unos seis meses sin usarla. Que funcione publicada y sin verificar (con el aviso «app no verificada») no se comprobó.
- **Consentimiento:** «Interno» si la cuenta es de Workspace; «Externo» con el usuario como usuario de prueba si es una cuenta personal.

**El «Preparando», medido** (`_mcp_tools`, lo que el runtime de cada turno espera por MCP). Usé `RINARI_HOME` temporal, un servidor local falso que tarda 1 s en arrancar y dos turnos seguidos con los mismos servicios, como el proceso del Engine (`engine_protocol/entry.py:49` arma los servicios una vez):

| Caso | Turno 1 | Turno 2 |
|---|---|---|
| 0 servidores | 0,00 s | 0,00 s |
| 2 locales | 2,72 s | 0,00 s |
| 5 locales | 7,20 s | 0,00 s |
| 1 remoto que cuelga (timeout 30 s) | 31,08 s | **30,01 s** |
| 1 remoto con el puerto cerrado | 2,02 s | 2,05 s |
| 5 locales + 1 remoto que cuelga | 37,65 s | **30,01 s** |

- **Se confirma:** los locales se conectan uno tras otro (unos 1,4 s cada uno con 1 s de arranque) y un remoto caído **se paga en cada turno**. Un servidor real que arranca con `npx` tarda más que el falso.
- Con la caché, el segundo turno de los locales no cuesta nada: el falso responde `tools/list` al instante. Un remoto real añade su ida y vuelta de `tools/list` en cada turno.
- La medición después de C2 se hace con el mismo script.

**Docker.** No hay un MCP oficial de Docker para manejar contenedores. `docker/mcp-gateway` es de Docker, pero es la pasarela que arranca servidores del catálogo de Docker Desktop, no un servidor de `ps`, `logs` o `run`. El más usado de la comunidad (`mcp-server-docker`) no es oficial. Según una reseña de mayo de 2026, no tiene commits desde junio de 2025 y tiene abierto un aviso de acceso al sistema de archivos del host (no lo comprobé en el repositorio). **Propuesta:** C7 se queda solo con las reglas de la política. La entrada del catálogo espera a que haya uno oficial o uno mantenido.

### C1. OAuth para MCP remotos

**Flujo:**
1. Al probar o conectar un servidor, un 401 con `resource_metadata` arranca el descubrimiento: metadatos del recurso → servidor de autorización → sus metadatos. **Sin 401 también** (C0: Google responde `initialize` y `tools/list` sin autenticación): «Conectar» pide `/.well-known/oauth-protected-resource<ruta>` igual. Sin metadatos del recurso (Atlassian), se piden los del servidor de autorización en el origen.
2. Cliente: registro dinámico si el servidor lo ofrece; si no, un documento de metadatos del cliente de Rinari publicado en `rinari.ai` (si C0 confirma que los servidores lo aceptan); si no, el usuario pega su propio `client_id` (y `client_secret` si hace falta). Google va siempre por cliente propio (C0).
3. Autorización con PKCE (S256) y el indicador de recurso, en **el navegador predeterminado del usuario**, no en el de Rinari: ahí ya tiene sus sesiones, y Google y otros bloquean los navegadores embebidos.
4. Redirección a `http://127.0.0.1:<puerto>/callback` en un puerto libre que el Engine abre solo para esa autorización (el patrón de apps nativas, RFC 8252). No hace falta registrar `rinari://`.
5. Tokens (acceso, renovación, vencimiento y alcances) al almacén de credenciales bajo `mcp/<id>/oauth`. Nunca a la base, a las vistas ni a los registros.
6. Renovación automática antes de vencer y al recibir un 401, también sin la app abierta (tareas programadas y Agency, C8). Si la renovación falla, el servidor pasa a «Hay que reconectar», la app lo muestra con un botón y llega una notificación; el turno recibe un error claro, no un fallo genérico.
7. Al eliminar el servidor o «Desconectar cuenta», se revoca el token si el servidor lo permite y se borra del almacén.

**Comandos nuevos:** `mcp.auth.start` (devuelve la URL y espera el callback), `mcp.auth.status`, `mcp.auth.cancel`, `mcp.auth.signout`; eventos de progreso y fin. Contrato, paridad y protocolo al día.

**Pruebas:** un servidor de autorización falso en las pruebas (descubrimiento, registro dinámico, PKCE, callback, renovación, 401 → renovar → reintentar, renovación fallida → «reconectar», cancelar a mitad, puerto ocupado, `state` incorrecto rechazado). Con servicios reales, lo que se pueda con las cuentas del dueño, anotando qué quedó sin comprobar.

### C2. Conectar como Claude Code

**Decisión (dueño, 2026-10-18): igual que Claude Code.** Claude Code conecta todos los servidores al iniciar cada sesión, en paralelo y sin bloquear: mientras uno sigue conectando, la sesión trabaja y sus herramientas aparecen cuando llega. Las herramientas quedan «diferidas»: el modelo ve los nombres y carga la definición al usarlas. Rinari ya conecta al iniciar la sesión; lo que cambia es el cómo:

- **En paralelo y en segundo plano.** El «Preparando» y el primer turno no esperan a ningún servidor.
- **Un servidor que llega tarde se suma** a la sesión cuando conecta: sus herramientas entran a `capability.search` desde ese momento.
- **Uno caído** queda con su estado y su pista, sin retrasar nada; se reintenta al activar una de sus herramientas o con «Reconectar».
- **Se mantiene** la caché de conexiones del Engine (`service.py:95`), así que un servidor local no arranca otro proceso por cada sesión.
- **Lista de herramientas al día** cuando el servidor avisa `notifications/tools/list_changed`.
- **Estado por servidor:** conectando, conectado, hay que reconectar (C1), error (con su pista), desactivado. Lo usan Ajustes, la tarjeta «Conectores» del Resumen y el diagnóstico.
- **`resources`:** dos herramientas genéricas, `mcp.resources.list` y `mcp.resources.read` (por servidor), como lecturas (`mcp.read`). Van por la puerta `tool.call` como el resto de MCP: si entraran al núcleo, la lista dependería de si hay servidores y dejaría de ser la misma en todas las conversaciones.
- **Con F42 la parte difícil ya está:** la lista del modelo no cambia cuando un servidor llega tarde, así que sumarlo no rompe la caché. Lo que falta es que el registro acepte herramientas nuevas mientras el turno corre (con su cerrojo) y que el índice de lo conectado de la nota del turno salga del estado real, no de lo que llegó a tiempo.
- **Cada turno arma su runtime** en el escritorio: la conexión en segundo plano tiene que vivir en el proceso del Engine, no en el runtime del turno, para que un turno no vuelva a esperar ni a reintentar un servidor caído.

**Pruebas:** con un servidor lento (con espera), el «Preparando» y `model.started` del primer turno no lo esperan; sus herramientas aparecen en `capability.search` cuando conecta; un servidor caído no retrasa el arranque; dos sesiones comparten el mismo proceso local; `list_changed` refresca; la medición de C0 mejora.

### C3. Pantalla «Conectores»

Reemplaza a «Servidores MCP» en Ajustes, con el sistema [Obsidiana neón](../design/obsidiana-neon.md) (leer la guía y su lista de comprobación antes de diseñar).

- **Tarjetas** con logo, nombre, el chip «MCP remoto» o «MCP local», la cuenta conectada (si el servidor la informa), el estado de C2 y «Conectar» / «Reconectar» / «Desconectar».
- **Detalle del conector:** sus herramientas con descripción y, por cada una, Permitir / Preguntar / Bloquear (C5); ámbito (todas las conversaciones o este proyecto) y, si es de proyecto, si la carpeta es de confianza; registros recientes.
- **«Agregar conector»** abre el catálogo (C4). Dentro, **«Agregar servidor MCP»** es el formulario de hoy (stdio o HTTP), ahora también con OAuth.
- **Google** con su guía paso a paso para crear el cliente propio (C0), dentro del alta.
- Imágenes → «MCP asignado» elige la herramienta de una lista, no escribiéndola.
- La tarjeta «Conectores» del Resumen muestra el estado nuevo y abre el detalle.

**Pruebas:** escenarios en `tests/ui` (agregar desde el catálogo, OAuth con servidor falso, reconectar, permisos por herramienta, ámbito y confianza), `ui-tour` con capturas, i18n en los dos idiomas, movimiento reducido.

### C4. Catálogo e importar configuraciones

**Catálogo** como datos (un JSON que va con el Engine y se actualiza con él), no código por servicio. Cada entrada: id, nombre, logo, descripción, tipo (remoto con su URL y autenticación, o local con su comando y los secretos que pide), enlace a la documentación y las herramientas esperadas. Entran los que C0 comprobó; elegir una entrada rellena el alta y el usuario solo pone lo que falta (iniciar sesión o pegar un token). Más adelante: buscar también en el registro público de MCP.

**Importar: como Claude Code** (decisión del dueño, 2026-10-18). Nunca se importa nada solo:
1. **Un `.mcp.json` en un proyecto de confianza:** al abrirlo, Rinari pregunta una vez por cada servidor («Esta carpeta trae 2 servidores MCP: ¿usarlos en este proyecto?»). Si el usuario dice que sí, quedan con ámbito de proyecto. También `.vscode/mcp.json` y `.cursor/mcp.json`, que ya se detectan. Una carpeta sin confianza no ofrece nada.
2. **«Importar de otra app»:** detecta las configuraciones de Claude Desktop, Claude Code, Cursor, VS Code y Codex en la PC y muestra una lista para marcar.
3. **Pegar el JSON** `mcpServers` a mano.

Los secretos que traen esas configuraciones van al almacén de credenciales y no se ven después.

**Pruebas:** el catálogo valida su esquema en CI; importar los formatos de cada herramienta (con secretos, que van al almacén y no se ven); la pregunta del `.mcp.json` sale una sola vez por servidor; una carpeta sin confianza no ofrece importar.

### C5. Permisos por conector y por herramienta

Encima de [permisos v4](plan-permisos-v4.md), sin cambiar sus tres modos:
- Las anotaciones del servidor cuentan: `readOnlyHint` → lectura; `destructiveHint` → riesgo alto; `openWorldHint` → envía fuera. Son pistas del servidor, no garantías: el usuario puede corregirlas por herramienta.
- Por herramienta: Permitir / Preguntar / Bloquear, que gana sobre la regla general del modo. «Siempre» en la tarjeta de permiso guarda eso mismo.
- **Mismo conector, mismo destino:** leer de un conector y volver a llamar al mismo conector no es «enviar a un destino nuevo» para la guardia de contenido externo. Pasar datos de un conector a otro sí cuenta. Hay que revisarlo con lo que ya hace la guardia antes de cambiarla.
- Acceso completo sigue sin preguntar nada, salvo la lista catastrófica y lo bloqueado a mano.

**Pruebas:** tabla de casos por modo × anotación × ajuste por herramienta; la guardia con un conector y con dos.

### C6. El modelo sabe qué conectores tiene

- **Medio hecho con F42:** la nota del turno ya lleva el índice de lo conectado (`tools/index.py:36`), con los nombres de las herramientas de cada servidor y su `instructions`. Falta una frase por conector que diga para qué sirve (del catálogo, C4, o de la descripción del servidor) y su estado (C2).
- `capability.search` ordena por coincidencia, sin favorecer a un servidor por llegar primero.
- Si un conector necesita reconectar, el modelo lo sabe y se lo dice al usuario en vez de intentar otra vía.

**Pruebas:** la línea aparece solo con conectores activos; un conector que conecta tarde entra a la búsqueda; uno que hay que reconectar lo dice el modelo.

### C7. Docker

**Decisión (dueño, 2026-10-18): reglas más una entrada en el catálogo, sin herramientas nativas.** El modelo ya sabe usar la consola de Docker; lo que falta es seguridad.
1. **Reglas en la política de la consola** para `docker` y `docker compose`: `ps`, `logs`, `inspect`, `images` son lecturas; `run`, `build`, `compose up` ejecutan; `rm`, `rmi`, `compose down -v`, `volume rm` y `system prune` son destructivos. Protegen a cualquier usuario, tenga o no el conector.
2. **Una entrada de Docker en el catálogo** si C0 encuentra un MCP bueno y mantenido, para quien quiera herramientas estructuradas.

**Pruebas:** tabla de comandos de Docker por modo; las variantes con `-f`, `--force` y `-a`.

### C8. Lo que necesita la Agency

La Agency ([idea-rinari-agency.md](idea-rinari-agency.md)) se va a probar pronto y necesita esto (dueño, 2026-10-18):
- **Conectores permitidos por agente y por equipo:** un agente solo ve las herramientas de sus conectores.
- **Credenciales con dueño** (D-11 de la Agency): una cuenta conectada pertenece a un equipo o a un agente, con el mismo almacén. Un mismo servicio puede estar conectado dos veces con cuentas distintas (la del equipo de contenido y la personal).
- **Sin la app abierta:** tareas programadas y agentes usan los conectores; la renovación del token no necesita pantalla (C1) y «Hay que reconectar» llega como notificación.
- **El disparador «reloj + MCP»** (punto 9 de la Agency): con una regla exacta, el motor llama a la herramienta del conector con datos fijos, sin modelo.
- **Acceso completo** en un agente no pregunta por sus conectores; lo bloqueado a mano (C5) sigue bloqueado.

**Cuándo:** la Agency se prueba cuando esté completa, no por fases (dueño, 2026-10-18). C8 va al final de este plan y debe estar listo para esa prueba.

## Decisiones (dueño, 2026-10-18)

| Tema | Decisión |
|---|---|
| Versión | 0.4.0, por tandas en las ramas `0.4.0`, con la Nightly al terminar. |
| Nombre | «Conectores» reemplaza a «Servidores MCP»; chip «MCP remoto/local» y «Agregar servidor MCP» dentro. |
| Conexión | Como Claude Code: al abrir la sesión, en paralelo y sin bloquear (C2). |
| Catálogo | Lo del directorio de Claude que funcione con Rinari como cliente, más ElevenLabs, GitHub, Planka, Docker y bases de datos (C0, C4). |
| Docker | Reglas en la política + entrada en el catálogo; sin herramientas nativas (C7). |
| Google | Cliente OAuth propio de cada usuario, con guía paso a paso (C0, C3). |
| Importar | Como Claude Code: `.mcp.json` de un proyecto de confianza con pregunta por servidor, «Importar de otra app» y pegar JSON; nada automático (C4). |
| Gateway | Va en [plan-gateway.md](plan-gateway.md), después de depurar aquí. |
| Agency | Lo que necesita de los conectores es el bloque C8 de este plan. La Agency se prueba completa, así que C8 va al final y listo antes de esa prueba. |

## Cómo se trabaja

- Tandas en las ramas `0.4.0` de CLI y Agent, con commits locales, como el resto de la 0.4.0. Las sesiones que escriben código van una a la vez por conjunto de archivos; CLI primero y después el Agent con el Engine fijado.
- Antes de cada entrega, las comprobaciones de `CLAUDE.md` y la batería `ui:e2e --all` (también con carga y con movimiento reducido).
- El Engine en pruebas, siempre con `RINARI_HOME` temporal.
- No se empieza hasta que el dueño lo diga.
